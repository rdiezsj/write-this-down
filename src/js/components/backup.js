import { zipSync, strToU8 } from 'fflate';
import documents from './documents';
import util from './utils';
import keys from '../keys';
import { validateOperation } from '../../bridge/protocol';

// Everything in one piece: every document and every setting. Used by "export
// everything" and by "import a backup".
//
//   { format: 'wtd-backup', version: 1, exported: ISO date, current: id,
//     settings: { key: value }, documents: [{ id, updated, text }] }
// (older files also carry a `title` per document, from when documents could be
// renamed; it is ignored, the first line names the document)
export default (function () {
    const FORMAT = 'wtd-backup';   // WTD's backup format
    const VERSION = 1;

    // The settings ui.js keeps in localStorage
    const SETTING_KEYS = keys.SETTINGS;

    function collect() {
        const settings = {};

        SETTING_KEYS.forEach((key) => {
            if (localStorage[key] !== undefined) {
                settings[key] = localStorage[key];
            }
        });

        const current = documents.current();
        const recovery = documents.bridgeRecoveryArchive?.() || {};
        const notes = documents.list().map(doc => ({
            id: doc.id,
            updated: doc.updated,
            text: util.htmlToText(documents.getContent(doc.id)),
            ...(documents.isReceived(doc.id) ? { received: true } : {}),
        }));
        const texts = new Set(notes.map(doc => doc.text));

        // Another tab may have replaced the visible cache while this writer's
        // intention is still pending. Export it as an additive note too, so a
        // restore never needs to replay old operations over the target library.
        for (const [key, raw] of Object.entries(recovery)) {
            if (!key.startsWith(keys.BRIDGE_OP_PREFIX)) continue;
            try {
                const { operation } = JSON.parse(raw);
                if (!validateOperation(operation) || operation.note.state === 'removed') continue;
                const text = util.htmlToText(operation.note.html);
                if (!text.trim() || texts.has(text)) continue;
                notes.push({ id: `recovered-${operation.opId}`, updated: operation.note.updated, text, received: true });
                texts.add(text);
            } catch { /* Keep malformed originals in recovery without replaying them. */ }
        }

        return {
            format: FORMAT,
            version: VERSION,
            exported: new Date().toISOString(),
            current: current ? current.id : null,
            settings,
            ...(Object.keys(recovery).length ? {recovery} : {}),
            documents: notes,
        };
    }

    function isBackup(data) {
        return !!data && data.format === FORMAT && typeof data.version === 'number' && Array.isArray(data.documents);
    }

    // Only adds. A document whose id is already here is skipped; settings are taken
    // only when nothing has been written in this browser yet (the app writes its
    // defaults on the first visit, so "no settings" is judged by the documents).
    // Returns what happened.
    function apply(data) {
        if (!isBackup(data)) {
            return null;
        }

        if (data.version > VERSION) {
            return { added: 0, skipped: 0, newer: true };
        }

        const wasBlank = documents.isBlank();
        const blank = wasBlank ? documents.list()[0] : null;
        let added = 0;
        let skipped = 0;

        data.documents.forEach((doc) => {
            // an empty document is the one every browser starts with: not worth carrying
            if (!doc || typeof doc.text !== 'string' || doc.text.trim() === '') {
                return;
            }

            if (documents.add(doc, util.textToHtml(doc.text))) {
                added++;
            } else {
                skipped++;
            }
        });

        if (wasBlank && data.settings) {
            SETTING_KEYS.forEach((key) => {
                if (typeof data.settings[key] === 'string') {
                    localStorage[key] = data.settings[key];
                }
            });
        }

        // the untouched empty document a fresh browser starts with gives way to what arrived
        if (blank && added > 0) {
            documents.remove(blank.id);
        }

        if (wasBlank && added > 0 && data.current && documents.list().some(doc => doc.id === data.current)) {
            documents.setCurrent(data.current);
        }

        return { added, skipped, settings: wasBlank };
    }

    function fileName() {
        return `wtd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    }

    // The same, as plain files: documents/<title>.md for each document, and the
    // .json beside them so the zip is a full backup too
    function zipFileName() {
        return `wtd-${new Date().toISOString().slice(0, 10)}.zip`;
    }

    function zipFiles(data) {
        const taken = new Set();
        const files = {};

        data.documents.forEach((doc) => {
            files[`documents/${util.fileName(util.firstLine(doc.text), 'md', taken)}`] = strToU8(doc.text);
        });
        files['wtd-backup.json'] = strToU8(JSON.stringify(data, null, 1));

        return zipSync(files);
    }

    return {
        FORMAT,
        VERSION,
        collect,
        isBackup,
        apply,
        fileName,
        zipFileName,
        zipFiles,
    };
})();
