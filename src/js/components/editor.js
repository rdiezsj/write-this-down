import util from './utils';
import documents from './documents';

// editor: binds the contenteditable article to the current document
export default (function() {

    // Editor elements
    let contentField;
    let editingId = null;

    let hasStorage = false;

    // Callbacks run after a different document is shown
    let changeListeners = [];

    // Called with true when storage refused a save (full) and with false once it takes again
    let fullListener = null;
    let storageFull = false;

    // Called after every successful save (the folder copy follows)
    let saveListener = null;

    // While a shared document is on screen the article is not the current document:
    // nothing is saved from it and nothing is loaded over it
    let locked = false;

    // Saving serialises the whole document, so it waits for a pause in typing and
    // runs at once whenever the page may go away or the document changes
    const SAVE_DELAY = 300;   // ms
    let saveTimer = null;
    let dirty = false;        // typed into since it was loaded or last saved

    function init() {
        hasStorage = util.supportsHtmlStorage();
        bindElements();

        createEventBindings();

        // Load state if storage is supported
        if (hasStorage) {
            documents.init();
            loadState();

            window.addEventListener('storage', onStorage, false);
        }
    }

    function createEventBindings() {
        if (hasStorage) {
            contentField.addEventListener('input', scheduleSave, false);
            contentField.addEventListener('blur', saveState, false);
            window.addEventListener('pagehide', saveState, false);
            window.addEventListener('beforeunload', event => {
                if (!saveState()) {
                    event.preventDefault();
                    event.returnValue = '';
                }
            }, false);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    saveState();
                }
            }, false);
        }

        // Plain text only: every formatting command the browser could apply (⌘U, a
        // menu, an extension) arrives here first and is refused
        contentField.addEventListener('beforeinput', (event) => {
            if (event.inputType && event.inputType.startsWith('format')) {
                event.preventDefault();
            }
        });
    }


    function bindElements() {
        contentField = document.querySelector('article.content');
    }

    function scheduleSave() {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveState, SAVE_DELAY);
    }

    // The text as it is kept: a class on a line is presentation (focus mode's
    // current line), so it is dropped from a copy of the DOM, never from the
    // serialised string, where a typed class="x" is text like any other
    function html() {
        const copy = contentField.cloneNode(true);

        copy.querySelectorAll('[class]').forEach(element => element.removeAttribute('class'));

        return copy.innerHTML;
    }

    // Writes now. Safe to call at any time; writes only what was typed here, so a
    // page that was not touched can never overwrite what another tab saved.
    function saveState() {
        clearTimeout(saveTimer);
        saveTimer = null;

        if (!hasStorage || locked || !dirty) {
            return true;
        }

        const written = documents.saveContent(editingId, html(), util.firstLineOf(contentField));

        // storage is full: the text stays on screen and is tried again on the next change
        dirty = !written;

        if (written && saveListener) {
            saveListener();
        }

        if (written === storageFull && fullListener) {
            storageFull = !written;
            fullListener(storageFull);
        }

        return written;
    }

    function onStorageFull(listener) {
        fullListener = listener;
    }

    function onSave(listener) {
        saveListener = listener;
    }

    // The kept copy of the current document, if a save had shrunk it
    function restorePrevious() {
        const current = documents.current();
        if (!current || current.id !== editingId || current.deleted || !documents.restorePrevious(editingId)) {
            return false;
        }

        dirty = false;
        loadState();

        return true;
    }

    function loadState() {
        if (locked || !saveState()) {
            return false;
        }

        editingId = documents.current().id;
        contentField.innerHTML = util.plainHtml(documents.getContent(editingId));
        dirty = false;
        notifyChange();
        return true;
    }

    function lock() {
        locked = true;
    }

    function unlock() {
        locked = false;
    }

    // Another tab changed a document: this tab's typing is written first, so the
    // reload never drops it, and the text is reloaded only if what is stored
    // differs from what is shown (so the caret stays when only the list changed)
    function onStorage(event) {
        if (!documents.isOwnKey(event.key)) {
            return;
        }

        if (!saveState()) return;

        const id = documents.current().id;

        documents.load();

        if (documents.current().id !== id || util.plainHtml(documents.getContent(id)) !== html()) {
            loadState();
        }
    }

    function openDocument(id) {
        if (id === editingId) {
            return saveState();
        }

        if (!saveState()) return false;
        documents.setCurrent(id);
        return loadState();
    }

    function createDocument(html, beforeLoad, options) {
        if (!saveState()) return null;

        const doc = documents.create(html || '', options);

        // storage is full: nothing was made, and the sticky message says why
        if (!doc) {
            if (fullListener) {
                storageFull = true;
                fullListener(true);
            }

            return null;
        }

        if (beforeLoad) beforeLoad(doc);
        documents.setCurrent(doc.id);
        loadState();

        return doc;
    }

    function removeDocument(id) {
        const wasCurrent = id === documents.current().id;

        if (!saveState()) return false;
        if (!documents.remove(id)) {
            if (fullListener) fullListener(true);
            return false;
        }

        if (wasCurrent) {
            loadState();
        }
        return true;
    }

    function onDocumentChange(listener) {
        changeListeners.push(listener);
    }

    function notifyChange() {
        changeListeners.forEach(listener => listener());
    }

    return {
        init: init,
        saveState: saveState,
        openDocument: openDocument,
        createDocument: createDocument,
        documentId: () => editingId,
        removeDocument: removeDocument,
        onDocumentChange: onDocumentChange,
        lock: lock,
        unlock: unlock,
        reload: loadState,
        onStorageFull: onStorageFull,
        onSave: onSave,
        restorePrevious: restorePrevious,
    }

})();
