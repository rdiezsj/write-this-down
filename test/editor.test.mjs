import test from 'node:test';
import assert from 'node:assert/strict';
import { component } from './helpers/component.mjs';
import keys from '../src/js/keys.js';

function setup() {
    let reject = false;
    const data = { [keys.DOCS]: JSON.stringify([{id:'a',auto:'A',updated:1},{id:'b',auto:'B',updated:1}]),
        [keys.CURRENT]:'a', [keys.DOC_PREFIX+'a']:'SAVED A', [keys.DOC_PREFIX+'b']:'SAVED B' };
    const localStorage = new Proxy(data, {set(target,key,value) {
        if (reject && key === keys.DOC_PREFIX+'a') throw new Error('QuotaExceededError');
        target[key] = value; return true;
    }});
    localStorage.removeItem = key => { delete data[key]; };
    const util = { supportsHtmlStorage:()=>true, plainHtml:s=>s, safeBridgeHtml:s=>s, firstLine:s=>s, htmlToText:s=>s, firstLineOf:e=>e.innerHTML };
    const makeDocuments=()=>component('documents', {localStorage, util, keys, t:s=>s});
    const documents=makeDocuments();
    const events = {};
    const bind = (name,fn) => { events[name] = fn; };
    const article = { innerHTML:'', addEventListener:bind,
        cloneNode() { return {innerHTML:this.innerHTML,querySelectorAll:()=>[]}; } };
    const editor = component('editor', { documents, util, window:{addEventListener:bind},
        document:{querySelector:()=>article,addEventListener:bind} });
    editor.init();
    const full = []; editor.onStorageFull(value=>full.push(value));
    const edit = () => { article.innerHTML='UNSAVED A'; events.input(); reject=true; };
    return {editor,documents,article,data,events,full,edit,allow:()=>{reject=false;},other:()=>{const store=makeDocuments();store.init();return store;}};
}

test('abrir otra nota no descarta el texto si falla el guardado; permite reintentar', () => {
    const s=setup();s.edit();
    assert.equal(s.editor.openDocument('b'),false);
    assert.equal(s.article.innerHTML,'UNSAVED A');
    assert.equal(s.documents.current().id,'a');
    assert.deepEqual(s.full,[true]);
    s.allow(); assert.equal(s.editor.openDocument('b'),true);
    assert.equal(s.data[keys.DOC_PREFIX+'a'],'UNSAVED A');
    assert.equal(s.article.innerHTML,'SAVED B');
    assert.deepEqual(s.full,[true,false]);
});

test('crear una nota no descarta un borrador aunque quepa una nota vacía', () => {
    const s=setup();s.edit();
    assert.equal(s.editor.createDocument(''),null);
    assert.equal(s.documents.list().length,2);
    assert.equal(s.article.innerHTML,'UNSAVED A');
    s.allow();s.editor.saveState();
});

test('storage y reload no reemplazan un borrador sin guardar', () => {
    const s=setup();s.edit();
    s.data[keys.CURRENT]='b';
    s.data[keys.DOCS]=JSON.stringify([{id:'a',updated:2},{id:'b',updated:2}]);
    s.events.storage({key:keys.DOCS});
    assert.equal(s.article.innerHTML,'UNSAVED A');
    assert.equal(s.documents.current().id,'a');
    assert.equal(s.editor.reload(),false);
    assert.equal(s.article.innerHTML,'UNSAVED A');
    s.allow();s.editor.saveState();
});

test('salir solicita confirmación únicamente mientras hay texto sin guardar', () => {
    const s=setup();s.edit();
    const event={preventDefault(){this.prevented=true;}};
    s.events.beforeunload(event);assert.equal(event.prevented,true);
    s.allow();
    const saved={preventDefault(){this.prevented=true;}};
    s.events.beforeunload(saved);assert.equal(saved.prevented,undefined);
    assert.equal(s.data[keys.DOC_PREFIX+'a'],'UNSAVED A');
});

test('una nota eliminada en otra pestaña no redirige el borrador a otra nota', () => {
    const s=setup();s.edit();
    s.data[keys.CURRENT]='b';
    s.other().remove('a');
    s.events.storage({key:keys.DOCS});
    s.allow();assert.equal(s.editor.saveState(),false);
    assert.equal(s.data[keys.DOC_PREFIX+'b'],'SAVED B');
    assert.equal(s.article.innerHTML,'UNSAVED A');
});

test('restaurar versión anterior no afecta a otra nota tras un borrado externo', () => {
    const s=setup();s.edit();s.data[keys.CURRENT]='b';
    s.other().remove('a');
    s.data[keys.DOC_PREFIX+'b'+keys.PREVIOUS_SUFFIX]='OLDER B';
    s.events.storage({key:keys.DOCS});
    assert.equal(s.editor.restorePrevious(),false);
    assert.equal(s.data[keys.DOC_PREFIX+'b'],'SAVED B');
    assert.equal(s.article.innerHTML,'UNSAVED A');
});


test('un tombstone recibido antes de CURRENT no bloquea los eventos posteriores',()=>{
    const s=setup();s.data[keys.META_PREFIX+'a']=JSON.stringify({id:'a',removed:true});
    assert.doesNotThrow(()=>s.events.storage({key:keys.META_PREFIX+'a'}));
    s.data[keys.CURRENT]='b';assert.doesNotThrow(()=>s.events.storage({key:keys.CURRENT}));
    assert.equal(s.article.innerHTML,'SAVED B');
});

test('la identidad del editor conserva el borrador de una nota borrada externamente',()=>{
    const s=setup();s.edit();s.other().remove('a');s.events.storage({key:keys.META_PREFIX+'a'});
    assert.equal(s.editor.documentId?.(),'a');
    assert.equal(s.article.innerHTML,'UNSAVED A');
});

test('preparar una copia ocurre antes de su primer renderizado',()=>{
    const s=setup();const order=[];
    s.editor.onDocumentChange(()=>order.push('render'));
    const doc=s.editor.createDocument('COPY',copy=>{assert.ok(copy.id);order.push('prepare');});
    assert.ok(doc);assert.deepEqual(order,['prepare','render']);
});

test('el puente no aplica una actualización si no puede guardar el borrador',()=>{
 const s=setup();s.edit();let applied=false;
 assert.equal(s.editor.receiveBridge(()=>{applied=true;return true;}),false);
 assert.equal(applied,false);assert.equal(s.article.innerHTML,'UNSAVED A');s.allow();s.editor.saveState();
});
test('el puente actualiza el artículo solo si cambia su contenido',()=>{
 const s=setup();let renders=0;s.editor.onDocumentChange(()=>renders++);
 assert.equal(s.editor.receiveBridge(()=>true),true);assert.equal(renders,0);
 assert.equal(s.editor.receiveBridge(()=>{s.data[keys.DOC_PREFIX+'a']='REMOTE';return true;}),true);
 assert.equal(s.article.innerHTML,'REMOTE');assert.equal(renders,1);
});

test('una edición conserva la revisión con la que se abrió aunque otra pestaña avance',()=>{
 const s=setup();let revision={epoch:'e',sequence:1},base;
 s.documents.bridgeRevision=()=>revision;
 s.editor.reload();
 const save=s.documents.saveContent;
 s.documents.saveContent=(id,html,line,seen)=>{base=seen;return save(id,html,line);};
 revision={epoch:'e',sequence:2};s.article.innerHTML='LOCAL';s.events.input();s.editor.saveState();
 assert.equal(base.sequence,1);
});

test('una copia de conflicto conserva el artículo y cambia la identidad de la nota abierta',()=>{
 const s=setup();let renders=0;s.editor.onDocumentChange(()=>renders++);
 assert.equal(s.editor.receiveBridge(()=>{s.documents.add({id:'conflict-x',updated:2},'SAVED A');return true;},()=>({from:'a',to:'conflict-x'})),true);
 assert.equal(s.editor.documentId(),'conflict-x');assert.equal(s.article.innerHTML,'SAVED A');assert.equal(renders,1);
});
test('storage no sustituye el texto de una operación local todavía pendiente',()=>{
 const s=setup();s.documents.setBridgeRecorder({pending:()=>true});s.data[keys.DOC_PREFIX+'a']='REMOTE';
 s.events.storage({key:keys.DOC_PREFIX+'a'});assert.equal(s.article.innerHTML,'SAVED A');
});
test('otra pestaña no cambia la selección local al recibir nuevos documentos',()=>{
 const s=setup();s.data[keys.CURRENT]='b';s.events.storage({key:keys.CURRENT});
 assert.equal(s.editor.documentId(),'a');assert.equal(s.article.innerHTML,'SAVED A');
});
