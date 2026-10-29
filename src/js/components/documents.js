import { t } from './i18n';
import util from './utils';
import keys from '../keys';
import {bridgeRecoveryNotes} from '../../bridge/recovery';

// Document store. The compatible list cache lives in localStorage['wtd.docs'],
// each document's HTML in localStorage['wtd.doc.<id>'].
export default (function () {
    const INDEX_KEY = keys.DOCS;
    const CURRENT_KEY = keys.CURRENT;
    const CONTENT_PREFIX = keys.DOC_PREFIX;
    const PREVIOUS_SUFFIX = keys.PREVIOUS_SUFFIX;   // the copy kept when a document lost most of its text

    // A save that shrinks a document this much keeps the previous copy
    const SHRINK_KEEP_FROM = 2000;   // characters the document had
    const SHRINK_RATIO = 0.2;        // and keeps less than this share of them

    // A deleted document stays in the list, marked with the time it was deleted
    // (`deleted`), and its text stays in storage; this long, then it is gone for good
    const TRASH_DAYS = 30;

    let docs = [];
    let currentId = null;

    // Per-document metadata is authoritative; the old shared index is a compatible cache.
    let writable = true;
    let recoveryNotice = null;
    let temporary = null;
    let bridgeRecorder = null;
    let recoveryViews = new Map();

    // The recorder is installed only when the local bridge is enabled.
    function setBridgeRecorder(recorder) { bridgeRecorder = recorder; }
    function prepareBridge(doc, html, state, base) {
        if (!bridgeRecorder) return null;
        let received = doc.received === true;
        try { received = received || sessionStorage.getItem(keys.RECEIVED_PREFIX + doc.id) === 'true'; } catch {}
        const note = { id: doc.id, updated: doc.updated || 0, state, received };
        if (state !== 'removed') { note.html = html || ''; note.auto = doc.auto || ''; }
        if (state === 'trash') note.deleted = doc.deleted;
        try { return bridgeRecorder.prepare(note, base) || false; } catch { return false; }
    }
    function finishBridge(token) {
        if (token === null) return true;
        try { return bridgeRecorder.applied(token); } catch { return false; }
    }

    function init() {
        load();
        if (writable) {
            docs.filter(doc => doc.deleted && doc.deleted < Date.now() - TRASH_DAYS * 86400000).forEach(doc => destroy(doc.id));
        }
        if (!docs.some(doc => !doc.deleted)) {
            const empty = create('');
            if (!empty && docs.length === 0) {
                if (!temporary) temporary = { id: newId(), auto: '', updated: Date.now() };
                docs = [temporary];
                writable = false;
            }
        }
        if (!getById(currentId) || getById(currentId).deleted) {
            currentId = docs.find(doc => !doc.deleted)?.id || docs[0]?.id;
        }
        if (writable) saveIndex();
    }

    function valid(doc) {
        return doc && typeof doc === 'object' && typeof doc.id === 'string' && doc.id.length > 0
            && !doc.id.endsWith(PREVIOUS_SUFFIX)
            && ['updated', 'deleted'].every(key => doc[key] === undefined || Number.isFinite(doc[key]))
            && (doc.auto === undefined || typeof doc.auto === 'string');
    }

    function preserve(raw) {
        if (Object.keys(localStorage).some(key => key.startsWith(keys.INDEX_RECOVERY_PREFIX) && localStorage[key] === raw)) return true;
        return write(keys.INDEX_RECOVERY_PREFIX + newId(), raw);
    }

    function load(keepSelection = false) {
        const selected = currentId;
        writable = true;
        const raw = localStorage[INDEX_KEY];
        let index = [];
        try {
            index = raw === undefined || raw === null ? [] : JSON.parse(raw);
            if (!Array.isArray(index) || !index.every(valid) || new Set(index.map(doc => doc.id)).size !== index.length) throw new Error('invalid index');
        } catch (error) {
            writable = preserve(raw);
            recoveryNotice = { preserved: writable };
            index = [];
        }
        let seed = [];
        const initial = localStorage[keys.LEGACY_INDEX];
        if (initial === undefined || initial === null) {
            if (writable && !write(keys.LEGACY_INDEX, JSON.stringify(index))) {
                writable = false;
                recoveryNotice = { preserved: false };
            }
        } else {
            try {
                seed = JSON.parse(initial);
                if (!Array.isArray(seed) || !seed.every(valid)) throw new Error('invalid seed');
            } catch (error) {
                const preserved = preserve(initial);
                writable = writable && preserved;
                recoveryNotice = { preserved: writable };
                seed = [];
            }
        }
        // Bootstrap snapshots never overwrite authoritative metadata that another tab wrote.
        const entries = new Map([...seed, ...index].map(doc => [doc.id, doc]));
        const removed = new Set();
        for (const key of Object.keys(localStorage).filter(key => key.startsWith(keys.META_PREFIX))) {
            const id = key.slice(keys.META_PREFIX.length);
            try {
                const doc = JSON.parse(localStorage[key]);
                if (!valid(doc) || doc.id !== id) throw new Error('invalid metadata');
                if (doc.removed === true) { entries.delete(id); removed.add(id); }
                else entries.set(id, doc);
            } catch (error) {
                const preserved = preserve(localStorage[key]);
                writable = writable && preserved;
                recoveryNotice = { preserved: writable };
            }
        }
        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(CONTENT_PREFIX) || key.endsWith(PREVIOUS_SUFFIX)) continue;
            const id = key.slice(CONTENT_PREFIX.length);
            if (!id || entries.has(id) || removed.has(id)) continue;
            entries.set(id, { id, auto: util.firstLine(util.htmlToText(localStorage[key])), updated: 0 });
            recoveryNotice = { preserved: writable };
        }
        recoveryViews = new Map(bridgeRecoveryNotes(localStorage).filter(item => !entries.has(item.note.id)).map(item => [item.note.id, item]));
        for (const {note, from} of recoveryViews.values()) entries.set(note.id, {id:note.id, auto:util.firstLine(util.htmlToText(util.safeBridgeHtml(note.html))),
            updated:note.updated, received:true, recoveredFrom:from, virtual:true});
        docs = [...entries.values()];
        if (writable && recoveryNotice && !recoveryNotice.preserved) recoveryNotice = { preserved: true };
        currentId = localStorage[CURRENT_KEY] || null;
        const draft = [...recoveryViews.values()].find(item => item.kind === 'draft' && item.from === currentId);
        if (draft) currentId = draft.note.id;
        if (keepSelection && entries.has(selected) && !entries.get(selected).deleted) currentId = selected;
    }

    function refresh() {
        const selected = currentId;
        load();
        if (getById(selected) && !getById(selected).deleted) currentId = selected;
    }

    function writeMeta(doc) {
        return writable && write(keys.META_PREFIX + doc.id, JSON.stringify(doc));
    }

    // One write; false when storage refuses it (full). Every write of the store
    // goes through here except the ones in saveContent, which keep the old copy
    function write(key, value) {
        try {
            localStorage[key] = value;
            return true;
        } catch (e) {
            return false;
        }
    }

    function saveIndex() {
        refresh();
        if (!writable) return false;
        // A stale cache can never remove a separately committed record.
        return write(INDEX_KEY, JSON.stringify(docs.filter(doc => !doc.virtual))) && write(CURRENT_KEY, currentId);
    }

    function newId() {
        return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function getById(id) {
        return docs.find(doc => doc.id === id);
    }

    // The documents, newest first; what is in the trash is not among them
    function list() {
        refresh();
        const active = docs.filter(doc => !doc.deleted).sort((a, b) => b.updated - a.updated);
        return active.length ? active : [current()];
    }

    // The trash, last deleted first
    function trash() {
        refresh();
        return docs.filter(doc => doc.deleted).sort((a, b) => b.deleted - a.deleted);
    }

    function current() {
        const selected = getById(currentId);
        if (selected && !selected.deleted) return selected;
        const active = docs.find(doc => !doc.deleted);
        if (active) { currentId = active.id; return active; }
        // A remote deletion (or a full, damaged store) may leave no active document.
        if (!temporary) temporary = { id: newId(), auto: '', updated: Date.now() };
        return temporary;
    }

    function setCurrent(id) {
        refresh();
        if (getById(id) && !getById(id).deleted) {
            currentId = id;
            saveIndex();
        }
    }

    // A document has no name of its own: `auto` is its first line (util.firstLine),
    // kept here so the list needs no text. Older entries may still carry a `title`
    // from when documents could be renamed; it is ignored.
    function create(html, options = {}) {
        refresh();
        if (!writable) return null;
        const doc = {
            id: newId(),
            auto: util.firstLine(util.htmlToText(html || '')),
            updated: Date.now(),
        };
        if (bridgeRecorder && options.received) doc.received = true;

        const token = prepareBridge(doc, html || '', 'active');
        if (token === false) return null;

        docs.unshift(doc);

        // a full store: nothing is left half-made, and null says so
        if (!write(CONTENT_PREFIX + doc.id, html || '') || !writeMeta(doc)) {
            localStorage.removeItem(CONTENT_PREFIX + doc.id);
            return null;
        }

        saveIndex();
        return finishBridge(token) ? doc : null;
    }

    // Add a document that already has an id (from a backup). An id that is already here is left alone: null says so.
    function add(doc, html) {
        refresh();
        if (!writable || !valid(doc)) return null;
        if (!doc.id || getById(doc.id) || localStorage[keys.META_PREFIX + doc.id] !== undefined) {
            return null;
        }

        const added = {
            id: doc.id,
            auto: util.firstLine(util.htmlToText(html || '')),
            updated: doc.updated || Date.now(),
        };
        if (doc.received === true) added.received = true;

        const token = prepareBridge(added, html || '', 'active');
        if (token === false) return null;

        docs.push(added);

        if (!write(CONTENT_PREFIX + added.id, html || '') || !writeMeta(added)) {
            localStorage.removeItem(CONTENT_PREFIX + added.id);
            return null;
        }

        saveIndex();
        return finishBridge(token) ? added : null;
    }

    // True when nothing has been written yet: at most one document, and it is empty
    function isBlank() {
        refresh();
        return docs.length === 0 || (docs.length === 1 && isEmpty(docs[0].id));
    }

    function isEmpty(id) {
        return getContent(id).replace(/<[^>]*>/g, '').trim() === '';
    }

    function getContent(id) {
        if (recoveryViews.has(id)) return util.safeBridgeHtml(recoveryViews.get(id).note.html);
        return localStorage[CONTENT_PREFIX + id] || '';
    }

    function isReceived(id) {
        if (recoveryViews.has(id)) return true;
        try { if (sessionStorage.getItem(keys.RECEIVED_PREFIX + id) === 'true') return true; } catch {}
        const raw = localStorage[keys.META_PREFIX + id];
        if (raw === undefined) return false;
        try { return JSON.parse(raw)?.received === true; } catch { return true; }
    }

    function snapshotForBridge() {
        refresh();
        if (!writable) return null;
        const notes = docs.filter(doc => !doc.virtual && (!temporary || doc.id !== temporary.id)).map(doc => {
            const note = { id: doc.id, html: getContent(doc.id), auto: doc.auto || '', updated: doc.updated || 0,
                state: doc.deleted ? 'trash' : 'active', received: isReceived(doc.id) };
            if (doc.deleted) note.deleted = doc.deleted;
            return note;
        });
        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(keys.META_PREFIX)) continue;
            try {
                const doc = JSON.parse(localStorage[key]);
                const id = key.slice(keys.META_PREFIX.length);
                if (!valid(doc) || doc.id !== id) return null;
                if (doc?.id === id && doc.removed === true)
                    notes.push({ id, updated: doc.updated || 0, state: 'removed', received: doc.received === true });
            } catch { return null; }
        }
        return notes;
    }

    function applyBridge(receipt, { preserve = [], focus = null } = {}) {
        refresh();
        if (!writable) return false;
        const { revision, opId } = receipt;
        const notes = receipt.conflict ? [receipt.conflict, receipt.note] : [receipt.note];
        if (!revision || typeof opId !== 'string' || !opId || typeof revision.epoch !== 'string' ||
            !Number.isSafeInteger(revision.sequence) || revision.sequence < 1 || notes.some(note =>
                !valid(note) || !['active', 'trash', 'removed'].includes(note.state) ||
                (note.state !== 'removed' && typeof note.html !== 'string') ||
                (note.state === 'trash' && !Number.isFinite(note.deleted)))) return false;
        try {
            const changes = [], confirmations = [];
            for (const note of notes) {
                if (preserve.includes(note.id)) continue;
                const raw = localStorage[keys.BRIDGE_REV_PREFIX + note.id];
                if (raw !== undefined) {
                    const known = JSON.parse(raw);
                    if (known.epoch !== revision.epoch) return false;
                    if (known.sequence >= revision.sequence) continue;
                }
                if (matchesBridgeNote(note) && (!note.received || isReceived(note.id)) && note.id !== receipt.conflictId) confirmations.push(note);
                else changes.push(note);
            }
            const recoveryKey = keys.BRIDGE_INBOUND_PREFIX + opId;
            if (changes.length) {
                const previous = localStorage[recoveryKey] === undefined ? null : JSON.parse(localStorage[recoveryKey]);
                const entries = changes.map(note => ({note, before:
                    previous?.entries?.find(entry => entry.note.id === note.id)?.before ||
                    (previous?.receipt?.note.id === note.id ? previous.before : null) ||
                    {content: localStorage[CONTENT_PREFIX + note.id], metadata: localStorage[keys.META_PREFIX + note.id]}}));
                const record = {receipt, entries, before: entries[0].before, focus};
                if (!write(recoveryKey, JSON.stringify(record))) return false;
                for (const note of changes) {
                    const metadata = {id: note.id, updated: note.updated, received: !!(note.received || isReceived(note.id))};
                    const prior = JSON.parse(localStorage[keys.META_PREFIX + note.id] || 'null');
                    if (prior?.recoveredFrom) metadata.recoveredFrom = prior.recoveredFrom;
                    if (prior?.conflictOf) metadata.conflictOf = prior.conflictOf;
                    if (note.id === receipt.conflictId) metadata.conflictOf = receipt.note.id;
                    if (note.state === 'removed') metadata.removed = true;
                    else {
                        const html = util.safeBridgeHtml(note.html);
                        metadata.auto = util.firstLine(util.htmlToText(html));
                        if (note.state === 'trash') metadata.deleted = note.deleted;
                        if (!write(CONTENT_PREFIX + note.id, html)) return false;
                    }
                    if (!writeMeta(metadata)) return false;
                }
                if (focus && localStorage[CURRENT_KEY] === focus.from && notes.some(note => note.id === focus.to && note.state === 'active')) {
                    if (!write(CURRENT_KEY, focus.to)) return false;
                    currentId = focus.to;
                }
                for (const note of changes) {
                    if (!write(keys.BRIDGE_REV_PREFIX + note.id, JSON.stringify(revision))) return false;
                }
                saveIndex();
            }
            for (const note of confirmations) if (!write(keys.BRIDGE_REV_PREFIX + note.id, JSON.stringify(revision))) return false;
            // Successful materialization no longer needs a duplicate of every edit.
            localStorage.removeItem(recoveryKey);
            return true;
        } catch { return false; }
    }

    function matchesBridgeNote(note) {
        try {
            const meta = JSON.parse(localStorage[keys.META_PREFIX + note.id] || 'null');
            if (!meta || meta.id !== note.id || !!meta.removed !== (note.state === 'removed')) return false;
            return note.state === 'removed' || (meta.updated === note.updated &&
                !!meta.deleted === (note.state === 'trash') && localStorage[CONTENT_PREFIX + note.id] === note.html);
        } catch { return false; }
    }

    function finishBridgePrepared(note, before) {
        refresh();
        if (!writable || note.state === 'removed' || !before || localStorage[CONTENT_PREFIX + note.id] !== note.html ||
            localStorage[keys.META_PREFIX + note.id] !== before.metadata) return false;
        const meta = {id:note.id, updated:note.updated, auto:note.auto, received:!!(note.received || isReceived(note.id))};
        if (note.state === 'trash') meta.deleted = note.deleted;
        if (!writeMeta(meta)) return false;
        saveIndex();return true;
    }

    function storeBridgeRecovery(note, from) {
        refresh();
        if (!writable) return false;
        const html = util.safeBridgeHtml(note.html), existing = localStorage[CONTENT_PREFIX + note.id];
        if (existing !== undefined && util.safeBridgeHtml(existing) !== html) return false;
        if (!write(CONTENT_PREFIX + note.id, html) || !writeMeta({id:note.id, auto:util.firstLine(util.htmlToText(html)),
            updated:note.updated, received:true, recoveredFrom:from})) return false;
        saveIndex();return true;
    }

    function bridgeRecoveryArchive() {
        const result = {};
        for (const key of Object.keys(localStorage)) {
            if (key === keys.BRIDGE_SNAPSHOT || key === keys.BRIDGE_BOOTSTRAP ||
                [keys.BRIDGE_OP_PREFIX, keys.BRIDGE_INBOUND_PREFIX, keys.BRIDGE_RECOVERY_PREFIX].some(prefix => key.startsWith(prefix)))
                result[key] = localStorage[key];
        }
        return result;
    }

    // Returns true when written, false when storage refused (full): the old copy
    // stays and nothing else is touched
    function saveContent(id, html, firstLine, base) {
        refresh();
        if (!writable) return false;

        const doc = getById(id) || (temporary && temporary.id === id ? temporary : null);
        const before = localStorage[CONTENT_PREFIX + id];

        if (!doc || doc.deleted) return false;
        if (doc.virtual) return false;
        if (before === html && doc.auto === firstLine) return true;

        const updated = Date.now();
        const token = prepareBridge({ ...doc, updated, auto: firstLine }, html, 'active', base);
        if (token === false) return false;

        try {
            // most of the text gone in one save: keep what was there, in case
            if (before && before.length >= SHRINK_KEEP_FROM && html.length < before.length * SHRINK_RATIO) {
                localStorage[CONTENT_PREFIX + id + PREVIOUS_SUFFIX] = before;
            }

            localStorage[CONTENT_PREFIX + id] = html;
            doc.updated = updated;
            doc.auto = firstLine;
            if (!writeMeta(doc)) return false;
            saveIndex();
        } catch (e) {
            return false;
        }

        return finishBridge(token);
    }

    function hasPrevious(id) {
        return localStorage[CONTENT_PREFIX + id + PREVIOUS_SUFFIX] !== undefined;
    }

    // Swap the document with its kept copy, so a restore can itself be undone
    function restorePrevious(id) {
        refresh();
        if (!writable) return false;
        const previous = localStorage[CONTENT_PREFIX + id + PREVIOUS_SUFFIX];
        const current = localStorage[CONTENT_PREFIX + id];

        if (previous === undefined) {
            return false;
        }

        if (bridgeRecorder) {
            const doc = getById(id);
            if (!doc || doc.deleted) return false;
            const restored = { ...doc, updated: Date.now(), auto: util.firstLine(util.htmlToText(previous)) };
            const token = prepareBridge(restored, previous, 'active');
            if (token === false) return false;
            try {
                // The prepared operation retains the restored text if a later write fails.
                localStorage[CONTENT_PREFIX + id + PREVIOUS_SUFFIX] = current || '';
                localStorage[CONTENT_PREFIX + id] = previous;
                if (!writeMeta(restored)) return false;
                saveIndex();
                return finishBridge(token);
            } catch { return false; }
        }

        localStorage[CONTENT_PREFIX + id] = previous;
        localStorage[CONTENT_PREFIX + id + PREVIOUS_SUFFIX] = current || '';

        return true;
    }

    // To the trash: the document and its text stay, out of the list. A document
    // with no text has nothing to keep and goes at once.
    function remove(id) {
        refresh();
        if (!writable) return false;
        const doc = getById(id);
        if (!doc || doc.deleted) return false;
        // Prepare the replacement first: a full store must not leave the editor without a note.
        if (docs.filter(item => !item.deleted).length === 1 && !create('')) return false;
        if (isEmpty(id)) {
            if (!forget(id)) return false;
        } else {
            const deleted = { ...doc, deleted: Date.now() };
            const token = prepareBridge(deleted, getContent(id), 'trash');
            if (token === false || !writeMeta(deleted) || !finishBridge(token)) return false;
        }
        refresh();
        if (currentId === id) currentId = current().id;
        saveIndex();
        return true;
    }

    // Out of the trash, to the top of the list
    function restore(id) {
        refresh();
        if (!writable) return false;
        const doc = getById(id);
        if (!doc || !doc.deleted) return false;
        const restored = { ...doc, updated: Date.now() };
        delete restored.deleted;
        const token = prepareBridge(restored, getContent(id), 'active');
        if (token === false) return false;
        if (!writeMeta(restored)) return false;
        saveIndex();
        return finishBridge(token);
    }

    // Gone for good; keep a tombstone so an obsolete cache cannot resurrect it.
    function destroy(id) {
        refresh();
        if (!writable || !getById(id) || !forget(id)) return false;
        saveIndex();
        return true;
    }

    function forget(id) {
        const token = prepareBridge({ id, updated: Date.now() }, '', 'removed');
        if (token === false) return false;
        if (!writeMeta({ id, removed: true })) return false;
        docs = docs.filter(doc => doc.id !== id);
        localStorage.removeItem(CONTENT_PREFIX + id);
        localStorage.removeItem(CONTENT_PREFIX + id + PREVIOUS_SUFFIX);
        return finishBridge(token);
    }

    // A document's text as something to search in: tags out, the few entities the
    // editor writes back to characters, lowercase. Cheaper than parsing the HTML.
    function searchText(doc) {
        return getContent(doc.id)
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;|\xa0/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .toLowerCase();
    }

    function titleOf(doc) {
        return doc.auto || t('Untitled');
    }

    function isOwnKey(key) {
        return key === INDEX_KEY || key === CURRENT_KEY || (key && (key.startsWith(CONTENT_PREFIX) || key.startsWith(keys.META_PREFIX) || key.startsWith(keys.BRIDGE_REV_PREFIX)));
    }

    return {
        init,
        load,
        recovery: () => recoveryNotice,
        list,
        trash,
        TRASH_DAYS,
        current,
        setCurrent,
        create,
        add,
        isBlank,
        getContent,
        saveContent,
        hasPrevious,
        restorePrevious,
        remove,
        restore,
        destroy,
        titleOf,
        searchText,
        isOwnKey,
        isReceived,
        snapshotForBridge,
        applyBridge,
        matchesBridgeNote,
        finishBridgePrepared,
        storeBridgeRecovery,
        hasBridgeRecovery(id, from) {
            try {const meta=JSON.parse(localStorage[keys.META_PREFIX + id] || 'null');return meta?.id===id && (meta.removed===true || meta.recoveredFrom===from);}catch{return false;}
        },
        bridgeRecoveryArchive,
        bridgeBefore: id => ({content:localStorage[CONTENT_PREFIX + id], metadata:localStorage[keys.META_PREFIX + id]}),
        hasBridgePending: (id, html) => !!bridgeRecorder?.pending?.(id, html),
        bridgeRevision(id) {
            try { return JSON.parse(localStorage[keys.BRIDGE_REV_PREFIX + id] || 'null'); } catch { return null; }
        },
        setBridgeRecorder,
    }
})();
