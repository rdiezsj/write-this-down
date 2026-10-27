import documents from './documents';
import backup from './backup';
import util from './utils';
import keys from '../keys';

// A copy that outlives the browser: a folder the person picks once, kept up to date
// with every document as <title>.md and everything as wtd-backup.json.
// Chromium on a computer only (File System Access API). The folder handle can only
// be kept in IndexedDB; after a browser restart Chrome asks once to confirm access.
export default (function () {
    const DB = keys.DB;
    const STORE = keys.KV_STORE;
    const KEY = keys.FOLDER;
    const MANIFEST = 'wtd-backup.json';
    const DOCS_DIR = 'documents';
    const WRITE_DELAY = 2000;   // ms after the last save

    let handle = null;
    let record = null;
    let queue = Promise.resolve();
    let state = 'off';          // 'unsupported' | 'off' | 'on' | 'paused'
    let timer = null;
    let listener = null;

    function supported() {
        return typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
    }

    // A tiny key-value store, only because a folder handle cannot live in localStorage
    function db() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB, 1);

            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function kv(mode, run) {
        const connection = await db();

        try {
            return await new Promise((resolve, reject) => {
                const transaction = connection.transaction(STORE, mode);
                const request = run(transaction.objectStore(STORE));
                transaction.oncomplete = () => resolve(request.result);
                transaction.onabort = () => reject(transaction.error);
                request.onerror = () => reject(request.error);
            });
        } finally {
            connection.close();
        }
    }

    function setState(next) {
        state = next;

        if (listener) {
            listener(state);
        }
    }

    function onChange(fn) {
        listener = fn;
    }

    async function init() {
        if (!supported()) {
            setState('unsupported');
            return;
        }

        try {
            const saved = await kv('readonly', store => store.get(KEY));
            record = saved && saved.handle ? saved : saved ? { handle: saved, entries: {} } : null;
            handle = record && record.handle;
        } catch (e) {
            handle = null;
        }

        if (!handle) {
            setState('off');
            return;
        }

        const permission = await handle.queryPermission({ mode: 'readwrite' });

        if (permission === 'granted') {
            setState('on');
            await writeAll();
        } else {
            setState('paused');
        }
    }

    // Needs a click: the folder picker
    async function choose() {
        try {
            handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'wtd', startIn: 'documents' });
        } catch (e) {
            return false;   // cancelled
        }

        const selected = handle;
        setState('off');
        clearTimeout(timer);
        await queue;
        await exclusive(async () => {
            const saved = await kv('readonly', store => store.get(KEY));
            const same = saved && saved.handle && await saved.handle.isSameEntry(selected);
            record = same ? saved : { handle: selected, entries: {} };
            handle = selected;
            await kv('readwrite', store => store.put(record, KEY));
        });
        setState('on');
        await writeAll();

        return true;
    }

    // Needs a click: Chrome confirms access after a restart
    async function resume() {
        if (!handle) {
            return false;
        }

        const permission = await handle.requestPermission({ mode: 'readwrite' });

        if (permission !== 'granted') {
            return false;
        }

        setState('on');
        await writeAll();

        return true;
    }

    async function stop() {
        setState('off');
        clearTimeout(timer);
        await queue;
        await exclusive(async () => {
            const saved = await kv('readonly', store => store.get(KEY));
            const savedHandle = saved && (saved.handle || saved);
            if (savedHandle && handle && await savedHandle.isSameEntry(handle)) {
                await kv('readwrite', store => store.delete(KEY));
            }
        });
        handle = record = null;
        setState('off');
    }

    function name() {
        return handle ? handle.name : '';
    }

    async function writeFile(dir, fileName, text) {
        const file = await dir.getFileHandle(fileName, { create: true });
        const stream = await file.createWritable();

        try {
            await stream.write(text);
            await stream.close();
        } catch (error) {
            await stream.abort().catch(() => {});
            throw error;
        }
    }

    async function digest(text) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function readFile(dir, name) {
        try {
            const file = await dir.getFileHandle(name);
            return await (await file.getFile()).text();
        } catch (error) {
            if (error.name === 'NotFoundError') return null;
            throw error;
        }
    }

    async function unchanged(dir, entry) {
        if (!entry) return false;
        const text = await readFile(dir, entry.name);
        return text !== null && await digest(text) === entry.hash;
    }

    // Only the browser's record proves ownership; an existing folder/manifest does not.
    // External edits keep their name and get a separate WTD copy.
    async function writeCopy(dir, base, extension, text, previous, owner) {
        const safe = await unchanged(dir, previous);
        let name = previous && previous.base === base && safe ? previous.name : null;
        if (!name) {
            const names = new Set();
            for await (const entry of dir.values()) names.add(entry.name.toLowerCase());
            const taken = { has: name => names.has(name.toLowerCase()), add: name => names.add(name.toLowerCase()) };
            name = util.fileName(base, extension, taken);
            if (name !== util.fileName(base, extension) || (previous && !safe)) owner.conflicts = true;
        }
        await writeFile(dir, name, text);
        return { name, base, hash: await digest(text) };
    }

    async function removeOwn(dir, entry, owner) {
        if (await unchanged(dir, entry)) {
            await dir.removeEntry(entry.name);
        } else if (entry && await readFile(dir, entry.name) !== null) {
            owner.conflicts = true;
        }
    }

    async function writeSnapshot(owner) {
        if (state !== 'on' || record !== owner) return;
        try {
            const saved = await kv('readonly', store => store.get(KEY));
            if (!saved) {
                setState('paused');
                return;
            }
            if (saved.handle) {
                if (!await saved.handle.isSameEntry(owner.handle)) {
                    setState('paused');
                    return;
                }
                owner.entries = saved.entries;
                owner.manifest = saved.manifest;
                owner.conflicts = saved.conflicts;
            }
            const data = backup.collect();
            const dir = await owner.handle.getDirectoryHandle(DOCS_DIR, { create: true });
            const old = { ...owner.entries };
            for (const doc of data.documents) {
                const id = `doc:${doc.id}`;
                const previous = old[id];
                const entry = await writeCopy(dir, util.firstLine(doc.text), 'md', doc.text, previous, owner);
                owner.entries[id] = entry;
                if (previous && previous.name !== entry.name) await removeOwn(dir, previous, owner);
                delete old[id];
            }
            for (const [id, entry] of Object.entries(old)) {
                await removeOwn(dir, entry, owner);
                delete owner.entries[id];
            }
            owner.manifest = await writeCopy(owner.handle, MANIFEST.slice(0, -5), 'json',
                JSON.stringify(data, null, 1), owner.manifest, owner);
            await kv('readwrite', store => store.put(owner, KEY));
            if (record === owner && state === 'on') setState('on');
        } catch (error) {
            if (record === owner && state === 'on') setState('paused');
        }
    }

    function exclusive(run) {
        return typeof navigator !== 'undefined' && navigator.locks
            ? navigator.locks.request(`${DB}-folder-copy`, run) : run();
    }

    // Connection changes and writes share the same lock across tabs.
    function writeAll() {
        const owner = record;
        queue = queue.then(() => exclusive(() => writeSnapshot(owner)));
        return queue;
    }

    // After a save: everything again, a moment later. One path only; the files are
    // small and the disk is local.
    function schedule() {
        if (state !== 'on') {
            return;
        }

        clearTimeout(timer);
        timer = setTimeout(writeAll, WRITE_DELAY);
    }

    return {
        supported,
        init,
        choose,
        resume,
        stop,
        name,
        state: () => state,
        onChange,
        conflicts: () => !!(record && record.conflicts),
        schedule,
        writeAll,
    };
})();
