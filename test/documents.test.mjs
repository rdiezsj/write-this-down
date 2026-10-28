import test from 'node:test';
import assert from 'node:assert/strict';
import { component } from './helpers/component.mjs';
import keys from '../src/js/keys.js';

function stores(index=JSON.stringify([{id:'a',auto:'A',updated:1}])) {
    const data={ [keys.DOCS]:index, [keys.CURRENT]:'a', [keys.DOC_PREFIX+'a']:'A', [keys.DOC_PREFIX+'orphan']:'ORPHAN', [keys.DOC_PREFIX+'a'+keys.PREVIOUS_SUFFIX]:'OLDER A' };
    delete data[keys.DOC_PREFIX+'orphan'];
    let fail=false,hook=null,hookKey=keys.DOCS;
    const storage=new Proxy(data,{set(obj,key,value){
        if(typeof fail==='function'?fail(key,value):fail)throw new Error('QuotaExceededError');
        if(hook&&key===hookKey){const run=hook;hook=null;run();}
        obj[key]=value;return true;
    }});
    storage.removeItem=k=>{delete data[k];};
    const make=()=>component('documents',{localStorage:storage,keys,util:{firstLine:s=>s,htmlToText:s=>s},t:s=>s});
    return {data,make,fail:v=>{fail=v;},interleave:fn=>{hookKey=keys.DOCS;hook=fn;},interleaveSeed:fn=>{hookKey=keys.LEGACY_INDEX||keys.META_PREFIX+'a';hook=fn;}};
}

test('una selección obsoleta no oculta una nota creada en otra pestaña',()=>{
    const s=stores(),a=s.make(),b=s.make();a.init();b.init();const next=b.create('B');
    a.setCurrent('a');const c=s.make();c.init();assert.ok(c.list().some(d=>d.id===next.id));
});

test('dos creaciones intercaladas conservan ambas notas tras recargar',()=>{
    const s=stores(),a=s.make(),b=s.make();a.init();b.init();let next;
    s.interleave(()=>{next=b.create('B');});const own=a.create('C');
    const c=s.make();c.init();assert.ok(c.list().some(d=>d.id===next.id));assert.ok(c.list().some(d=>d.id===own.id));
});

test('un índice antiguo no resucita una nota destruida durante su escritura',()=>{
    const s=stores(),a=s.make(),b=s.make();a.init();b.init();
    s.interleave(()=>b.destroy('a'));a.setCurrent('a');
    const c=s.make();c.init();assert.ok(!c.list().some(d=>d.id==='a'));
    assert.equal(s.data[keys.DOC_PREFIX+'a'],undefined);
});

test('importar y borrar desde un almacén obsoleto no oculta nuevas notas',()=>{
    const s=stores(),a=s.make(),b=s.make();a.init();b.init();const newer=b.create('NEWER');
    a.add({id:'imported',updated:1},'IMPORTED');a.remove('a');
    const c=s.make();c.init();assert.ok(c.list().some(d=>d.id===newer.id));assert.ok(c.trash().some(d=>d.id==='a'));assert.ok(c.list().some(d=>d.id==='imported'));
});

for(const raw of ['not json','{}','null','[null]','[{"id":"a"},{"id":"a"}]']) {
    test(`recupera índice inválido conservando su evidencia: ${raw}`,()=>{
        const s=stores(raw);s.data[keys.DOC_PREFIX+'orphan']='ORPHAN';const a=s.make();a.init();
        assert.ok(a.list().some(d=>d.id==='a'));assert.ok(a.list().some(d=>d.id==='orphan'));
        assert.ok(!a.list().some(d=>d.id==='a.prev'));
        assert.ok(Object.entries(s.data).some(([k,v])=>k.startsWith(keys.INDEX_RECOVERY_PREFIX)&&v===raw));
        assert.equal(a.recovery().preserved,true);
        assert.equal(s.data[keys.DOC_PREFIX+'a'],'A');
    });
}

test('si no cabe la evidencia, deja el índice intacto y las notas consultables',()=>{
    const s=stores('BROKEN');s.fail(true);const a=s.make();a.init();
    assert.equal(s.data[keys.DOCS],'BROKEN');assert.ok(a.list().some(d=>d.id==='a'));
    assert.equal(a.getContent('a'),'A');assert.equal(a.create('NEW'),null);
    assert.equal(a.saveContent('a','REPLACEMENT','REPLACEMENT'),false);
    assert.equal(a.recovery().preserved,false);
});

test('un índice ausente recupera contenidos existentes sin sustituirlos por una nota vacía',()=>{
    const s=stores();delete s.data[keys.DOCS];const a=s.make();a.init();assert.ok(a.list().some(d=>d.id==='a'));assert.equal(a.getContent('a'),'A');
});


test('fallos de metadatos no anuncian ni aplican borrados/restauraciones',()=>{
    const s=stores(),a=s.make();a.init();s.fail(true);
    assert.equal(a.remove('a'),false);assert.ok(a.list().some(d=>d.id==='a'));
    assert.equal(a.destroy('a'),false);assert.equal(a.getContent('a'),'A');
    s.fail(false);assert.equal(a.remove('a'),true);s.fail(true);
    assert.equal(a.restore('a'),false);assert.ok(a.trash().some(d=>d.id==='a'));
});

test('no elimina la última nota si no puede preparar una nota vacía de reemplazo',()=>{
    const s=stores(),a=s.make();a.init();s.fail(key=>key.startsWith(keys.DOC_PREFIX)&&key!==keys.DOC_PREFIX+'a');
    assert.equal(a.remove('a'),false);assert.ok(a.list().some(d=>d.id==='a'));assert.equal(a.current().id,'a');
});

test('índice vacío corrupto y sin espacio mantiene un editor consultable',()=>{
    const s=stores('BROKEN');delete s.data[keys.DOC_PREFIX+'a'];s.fail(true);const a=s.make();a.init();
    assert.equal(a.list().length,1);assert.ok(a.current());assert.equal(s.data[keys.DOCS],'BROKEN');
});


test('la primera migración no resucita una nota eliminada por otra pestaña',()=>{
    const s=stores(),a=s.make(),b=s.make();
    s.interleaveSeed(()=>{b.init();b.remove('a');});a.init();
    assert.ok(a.trash().some(d=>d.id==='a'));assert.ok(!a.list().some(d=>d.id==='a'));
});

test('un borrador temporal puede guardarse tras liberar espacio y preservar el índice',()=>{
    const s=stores('BROKEN');delete s.data[keys.DOC_PREFIX+'a'];s.fail(true);const a=s.make();a.init();
    const id=a.current().id;a.list();s.fail(false);
    assert.equal(a.saveContent(id,'RECOVERED DRAFT','RECOVERED DRAFT'),true);
    assert.equal(a.getContent(id),'RECOVERED DRAFT');
});

test('el aviso deja de indicar solo lectura cuando ya se puede reparar el almacenamiento',()=>{
    const s=stores();s.fail(true);const a=s.make();a.init();assert.equal(a.recovery().preserved,false);
    s.fail(false);assert.equal(a.saveContent('a','UPDATED','UPDATED'),true);assert.equal(a.recovery().preserved,true);
});
