import { t, currentLanguage } from './i18n';
import app from './app';
import caret from './caret';
import editor from './editor';
import documents from './documents';
import folder from './folder';
import util from './utils';

// Documents: the list (⌘⇧O), opening, duplicating, deleting to the
// trash, the trash itself, and a new document
export default (function () {
    let documentsElement = null;

    function init() {
        documentsElement = document.querySelector('.documents');
        documentsElement.onclick = onDocumentsClick;
        app.documentsElement = documentsElement;
    }

    // DOCUMENTS: the list, opening, duplicating, deleting, a new one

    function onDocumentsClick() {
        if (app.shared.active) {
            return;
        }

        if (app.picker.kind === 'documents') {
            app.closePicker();
            return;
        }

        openDocumentsPicker();
    }

    function openDocumentsPicker() {
        const current = documents.current();
        const items = documents.list().map(doc => ({
            label: documents.titleOf(doc),
            hint: new Date(doc.updated).toLocaleDateString(currentLanguage()),
            text: documents.searchText(doc),
            current: current && doc.id === current.id,
            run: () => openDocument(doc.id),
            actions: {
                duplicate: () => duplicateDocument(doc),
                delete: () => deleteDocument(doc),
            },
        }));

        if (documents.trash().length) {
            items.push(trashItem());
        }

        app.openPicker({
            kind: 'documents',
            startOnCurrent: true,
            placeholder: 'filter documents',
            foot: `enter open · ${app.formatKeys('Mod D')} duplicate · ${app.formatKeys('Mod ⌫')} delete`,
            items,
        });
    }

    function openDocument(id) {
        if (!editor.openDocument(id)) return false;

        if (!app.is.touch) {
            app.article.focus();
        }
        return true;
    }

    // A copy of the document, opened
    function duplicateDocument(doc) {
        const copy = editor.createDocument(documents.getContent(doc.id), copy => app.inheritImageRestrictions(doc.id, copy.id));

        app.closePicker(false);

        if (!copy) {
            return;   // storage is full; the status line says so
        }

        openDocument(copy.id);
        folder.writeAll();
        app.setStatus('duplicated', 3000);
    }

    // To the trash, no question asked: the trash is the way back
    function deleteDocument(doc) {
        if (!editor.removeDocument(doc.id)) return;
        folder.writeAll();
        app.setStatus(documents.trash().some(d => d.id === doc.id)
            ? `moved "${documents.titleOf(doc)}" to trash · ${documents.TRASH_DAYS} days`
            : `deleted "${documents.titleOf(doc)}"`, 3000);
        openDocumentsPicker();
    }

    // TRASH: deleted documents, kept for a while (see documents.js); a row at the
    // end of the documents list and of the menu while there is something in it

    function trashItem() {
        const count = documents.trash().length;

        return { label: t('trash…'), hint: `${count} ${count === 1 ? 'document' : 'documents'}, gone after ${documents.TRASH_DAYS} days`, run: openTrashPicker };
    }

    function openTrashPicker() {
        const items = documents.trash().map(doc => ({
            label: documents.titleOf(doc),
            hint: `deleted ${new Date(doc.deleted).toLocaleDateString(currentLanguage())}`,
            run: () => restoreDocument(doc),
            actions: {
                restore: () => restoreDocument(doc),
                delete: () => destroyDocument(doc),
            },
        }));

        items.push({ label: t('empty trash'), hint: 'for good', run: emptyTrash });

        app.openPicker({
            kind: 'trash',
            placeholder: 'filter the trash',
            foot: `enter restore · ${app.formatKeys('Mod ⌫')} delete for good`,
            items,
        });
    }

    function restoreDocument(doc) {
        if (!documents.restore(doc.id)) {
            app.setStatus('could not update the document · free space and try again', 4000);
            return;
        }
        app.closePicker(false);
        openDocument(doc.id);
        folder.writeAll();
        app.setStatus(`restored "${documents.titleOf(doc)}"`, 3000);
    }

    function destroyDocument(doc) {
        if (window.confirm(t(`Delete "${documents.titleOf(doc)}" for good?`))) {
            if (!documents.destroy(doc.id)) {
                app.setStatus('could not update the document · free space and try again', 4000);
                return;
            }
        }

        if (documents.trash().length) {
            openTrashPicker();
        } else {
            openDocumentsPicker();
        }
    }

    function emptyTrash() {
        const count = documents.trash().length;

        if (window.confirm(t(`Empty the trash? ${count} ${count === 1 ? 'document' : 'documents'}, for good.`))) {
            const removed = documents.trash().every(doc => documents.destroy(doc.id));
            app.setStatus(removed ? 'trash emptied' : 'could not update the document · free space and try again', 3000);
        }
    }

    function newDocument() {
        if (app.shared.active) {
            return;
        }

        if (!editor.createDocument('')) return;
        app.removeOverlay();
        app.closePicker(false);
        app.article.focus();
        caret.placeAtEdge(true);   // focus alone does not always give an empty editable a caret (Safari)
        caret.wake();
        caret.schedule();
        app.setStatus('new document');
    }

    // today: the document whose first line is today's date, opened; or started with
    // that date as a heading. The date is written as 2026-10-10 (sorts, reads the
    // same everywhere); a document named with the local form (10/10/2026) counts too.
    function today() {
        if (app.shared.active) {
            return;
        }

        const now = new Date();
        const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const names = [iso, now.toLocaleDateString(currentLanguage())];
        const existing = documents.list().find(doc => names.includes(documents.titleOf(doc)));

        if (existing) {
            app.removeOverlay();
            app.closePicker(false);
            if (!openDocument(existing.id)) return;
            app.setStatus(`today: ${documents.titleOf(existing)}`, 2000);
        } else {
            if (!editor.createDocument(util.textToHtml(`# ${iso}\n\n`))) return;
            app.removeOverlay();
            app.closePicker(false);
            app.article.focus();
            caret.placeAtEdge(false);
            caret.wake();
            caret.schedule();
            app.setStatus(`today: ${iso}, started`, 2000);
        }
    }

    return {
        init,
        today,
        toggle: onDocumentsClick,
        openList: openDocumentsPicker,
        open: openDocument,
        create: newDocument,
        trashItem,
        openTrash: openTrashPicker,
        element: () => documentsElement,
    };
})();
