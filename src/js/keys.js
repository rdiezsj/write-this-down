// Names used by WTD to keep data in the browser.
export default {
    // localStorage: the documents
    DOCS: 'wtd.docs',                 // the list: [{ id, auto, updated, deleted }]; `auto` is the first line
    CURRENT: 'wtd.current',           // the open document's id
    DOC_PREFIX: 'wtd.doc.',           // + id: a document's HTML
    PREVIOUS_SUFFIX: '.prev',         // + after a document key: the copy kept when it shrank

    // localStorage: the settings, in the order the backup carries them
    SETTINGS: ['language', 'scheme', 'font-scheme', 'font-size', 'sound', 'focus-mode', 'preview', 'line-numbers', 'contents', 'spellcheck', 'caret-prefs', 'counter', 'ripples'],
    SCHEME: 'scheme',                 // read by the inline script in index.html too (a literal there)
    LEGACY_MUTED: 'muted',            // the on/off sound setting before the sets
    LEGACY_CARET: 'caret',            // the one cursor setting before the per-font one

    // IndexedDB: the folder copy's handle
    DB: 'wtd',
    KV_STORE: 'kv',
    FOLDER: 'folder',
};
