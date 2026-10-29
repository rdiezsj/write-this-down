// Names used by WTD to keep data in the browser.
export default {
    // localStorage: the documents
    DOCS: 'wtd.docs',                 // the list: [{ id, auto, updated, deleted }]; `auto` is the first line
    LEGACY_INDEX: 'wtd.index.seed',   // initial index snapshot; mutations use per-document metadata
    META_PREFIX: 'wtd.meta.',        // + id: independent metadata, including deletion tombstones
    INDEX_RECOVERY_PREFIX: 'wtd.recovery.index.', // original damaged indexes, kept locally
    CURRENT: 'wtd.current',           // the open document's id
    DOC_PREFIX: 'wtd.doc.',           // + id: a document's HTML
    PREVIOUS_SUFFIX: '.prev',         // + after a document key: the copy kept when it shrank

    // sessionStorage: provenance only; image permissions never persist
    RECEIVED_PREFIX: 'wtd.received.', // + document id imported from a share link in this tab

    // localStorage: the settings, in the order the backup carries them
    SETTINGS: ['language', 'scheme', 'font-scheme', 'font-size', 'sound', 'focus-mode', 'preview', 'line-numbers', 'contents', 'spellcheck', 'caret-prefs', 'counter', 'ripples'],
    SCHEME: 'scheme',                 // read by the inline script in index.html too (a literal there)
    LEGACY_MUTED: 'muted',            // the on/off sound setting before the sets
    LEGACY_CARET: 'caret',            // the one cursor setting before the per-font one

    // IndexedDB: the folder copy's handle
    BRIDGE_CURSOR: 'wtd.bridge.cursor', // acknowledged canonical feed position
    BRIDGE_SNAPSHOT: 'wtd.bridge.snapshot', // recoverable library before first connection
    BRIDGE_INBOUND_PREFIX: 'wtd.bridge.inbound.', // received changes and previous local values
    BRIDGE_OP_PREFIX: 'wtd.bridge.op.', // durable local operations
    BRIDGE_ORDER: 'wtd.bridge.order', // local queue order, independent of Storage enumeration
    BRIDGE_REV_PREFIX: 'wtd.bridge.rev.', // latest acknowledged revision by document
    BRIDGE_DB: 'wtd.bridge',            // extension's local bridge coordinator
    DB: 'wtd',
    KV_STORE: 'kv',
    FOLDER: 'folder',
};
