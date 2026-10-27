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
    const util = { supportsHtmlStorage:()=>true, plainHtml:s=>s, firstLine:s=>s, htmlToText:s=>s, firstLineOf:e=>e.innerHTML };
    const documents = component('documents', {localStorage, util, keys, t:s=>s});
    const events = {};
    const bind = (name,fn) => { events[name] = fn; };
    const article = { innerHTML:'', addEventListener:bind,
        cloneNode() { return {innerHTML:this.innerHTML,querySelectorAll:()=>[]}; } };
    const editor = component('editor', { documents, util, window:{addEventListener:bind},
        document:{querySelector:()=>article,addEventListener:bind} });
    editor.init();
    const full = []; editor.onStorageFull(value=>full.push(value));
    const edit = () => { article.innerHTML='UNSAVED A'; events.input(); reject=true; };
    return {editor,documents,article,data,events,full,edit,allow:()=>{reject=false;}};
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
    s.data[keys.DOCS]=JSON.stringify([{id:'a',deleted:2,updated:1},{id:'b',updated:2}]);
    s.events.storage({key:keys.DOCS});
    s.allow();assert.equal(s.editor.saveState(),false);
    assert.equal(s.data[keys.DOC_PREFIX+'b'],'SAVED B');
    assert.equal(s.article.innerHTML,'UNSAVED A');
});

test('restaurar versión anterior no afecta a otra nota tras un borrado externo', () => {
    const s=setup();s.edit();s.data[keys.CURRENT]='b';
    s.data[keys.DOCS]=JSON.stringify([{id:'a',deleted:2,updated:1},{id:'b',updated:2}]);
    s.data[keys.DOC_PREFIX+'b'+keys.PREVIOUS_SUFFIX]='OLDER B';
    s.events.storage({key:keys.DOCS});
    assert.equal(s.editor.restorePrevious(),false);
    assert.equal(s.data[keys.DOC_PREFIX+'b'],'SAVED B');
    assert.equal(s.article.innerHTML,'UNSAVED A');
});
