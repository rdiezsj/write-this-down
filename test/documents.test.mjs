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
    const make=()=>component('documents',{localStorage:storage,keys,util:{firstLine:s=>s,htmlToText:s=>s,safeBridgeHtml:s=>s},t:s=>s});
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

test('el puente prepara cada cambio antes de tocar la nota y confirma después',()=>{
    const s=stores(),docs=s.make(),events=[];docs.init();
    docs.setBridgeRecorder({prepare(note){events.push(['prepare',note.state,note.id,s.data[keys.DOC_PREFIX+note.id]]);return 'op';},applied(id){events.push(['applied',id]);return true;}});
    const created=docs.create('B');assert.ok(created);
    assert.equal(docs.saveContent(created.id,'B nueva','B nueva'),true);
    assert.equal(docs.remove(created.id),true);
    assert.equal(docs.restore(created.id),true);
    assert.equal(docs.destroy(created.id),true);
    assert.deepEqual(events.map(event=>event[0]),['prepare','applied','prepare','applied','prepare','applied','prepare','applied','prepare','applied']);
    assert.deepEqual(events.filter(event=>event[0]==='prepare').map(event=>event[1]),['active','active','trash','active','removed']);
    assert.equal(events[0][3],undefined);assert.equal(events[2][3],'B');
});

test('si el puente no puede preparar un cambio, el texto anterior permanece',()=>{
    const s=stores(),docs=s.make();docs.init();docs.setBridgeRecorder({prepare:()=>false,applied:()=>{throw Error('no debe llegar');}});
    assert.equal(docs.saveContent('a','NUEVO','NUEVO'),false);assert.equal(s.data[keys.DOC_PREFIX+'a'],'A');
    assert.equal(docs.create('B'),null);assert.equal(docs.list().length,1);
});

test('restaurar la versión anterior prepara una operación antes de intercambiar textos',()=>{
    const s=stores(),docs=s.make(),events=[];docs.init();
    docs.setBridgeRecorder({prepare(note){events.push([note.state,note.html,s.data[keys.DOC_PREFIX+'a']]);return 'op';},applied(){events.push(['applied']);return true;}});
    assert.equal(docs.restorePrevious('a'),true);
    assert.deepEqual(events,[['active','OLDER A','A'],['applied']]);
    assert.equal(s.data[keys.DOC_PREFIX+'a'],'OLDER A');assert.equal(s.data[keys.DOC_PREFIX+'a'+keys.PREVIOUS_SUFFIX],'A');
});

test('una nota recibida conserva su procedencia restrictiva desde antes de prepararse',()=>{
    const s=stores(),docs=s.make(),records=[];docs.init();
    docs.setBridgeRecorder({prepare(note){records.push(note);return 'op';},applied:()=>true});
    const note=docs.create('![imagen](https://ejemplo.invalid/a.png)',{received:true});
    assert.equal(records[0].received,true);
    assert.equal(docs.isReceived(note.id),true);
    const afterRestart=s.make();afterRestart.init();assert.equal(afterRestart.isReceived(note.id),true);
});

test('restaurar una nota recibida conserva su restricción en sus metadatos',()=>{
    const s=stores(),docs=s.make();docs.init();
    assert.ok(docs.add({id:'recibida',updated:1,received:true},'texto'));
    assert.equal(docs.isReceived('recibida'),true);
    const restarted=s.make();restarted.init();assert.equal(restarted.isReceived('recibida'),true);
});

test('la instantánea del puente incluye notas, papelera y tombstones sin cambiar el almacén',()=>{
 const s=stores(),docs=s.make();docs.init();
 s.data[keys.DOC_PREFIX+'papelera']='DESCARTADA';s.data[keys.META_PREFIX+'papelera']=JSON.stringify({id:'papelera',auto:'DESCARTADA',updated:3,deleted:4});
 s.data[keys.META_PREFIX+'eliminada']=JSON.stringify({id:'eliminada',removed:true});
 const before=JSON.stringify(s.data),notes=JSON.parse(JSON.stringify(docs.snapshotForBridge()));
 assert.equal(notes.find(x=>x.id==='a').html,'A');
 assert.equal(notes.find(x=>x.id==='papelera').state,'trash');
 assert.equal(notes.find(x=>x.id==='eliminada').state,'removed');
 assert.equal(JSON.stringify(s.data),before);
});

test('la instantánea del puente no omite datos cuando la recuperación está en solo lectura',()=>{
 const s=stores('CORRUPTO');s.fail(true);const docs=s.make();docs.init();
 assert.equal(docs.snapshotForBridge(),null);assert.equal(s.data[keys.DOCS],'CORRUPTO');assert.equal(s.data[keys.DOC_PREFIX+'a'],'A');
});

test('la instantánea se detiene ante metadatos dañados aunque se haya conservado su evidencia',()=>{
 const s=stores(),docs=s.make();docs.init();s.data[keys.META_PREFIX+'otra']='CORRUPTO';
 assert.equal(docs.snapshotForBridge(),null);assert.equal(s.data[keys.META_PREFIX+'otra'],'CORRUPTO');
});

test('aplicar un cambio del puente conserva el original y no vuelve a emitirlo',()=>{
 const s=stores(),docs=s.make();docs.init();let emitted=false;
 docs.setBridgeRecorder({prepare(){emitted=true;return false;},applied:()=>true});
 const receipt={opId:'remote',outcome:'accepted',revision:{epoch:'e',sequence:1},note:{id:'a',html:'REMOTE',auto:'REMOTE',updated:2,state:'active',received:true}};
 assert.equal(docs.applyBridge(receipt),true);assert.equal(docs.getContent('a'),'REMOTE');assert.equal(emitted,false);
 assert.equal(s.data[keys.BRIDGE_INBOUND_PREFIX+'remote'],undefined);
 assert.equal(docs.applyBridge({...receipt,note:{...receipt.note,html:'STALE'}}),true);assert.equal(docs.getContent('a'),'REMOTE');
});
test('si no cabe la copia de recuperación del puente, no modifica el texto',()=>{
 const s=stores(),docs=s.make();docs.init();s.fail(k=>k.startsWith(keys.BRIDGE_INBOUND_PREFIX));
 assert.equal(docs.applyBridge({opId:'remote',revision:{epoch:'e',sequence:1},note:{id:'a',html:'REMOTE',auto:'REMOTE',updated:2,state:'active',received:true}}),false);
 assert.equal(docs.getContent('a'),'A');
});

test('una recepción interrumpida conserva ambas versiones y se puede reintentar',()=>{
 const s=stores(),docs=s.make();docs.init();s.fail(k=>k===keys.META_PREFIX+'a');
 const receipt={opId:'interrupted',revision:{epoch:'e',sequence:1},note:{id:'a',html:'NUEVA',auto:'NUEVA',updated:2,state:'active',received:true}};
 assert.equal(docs.applyBridge(receipt),false);
 const recovery=JSON.parse(s.data[keys.BRIDGE_INBOUND_PREFIX+'interrupted']);
 assert.equal(recovery.before.content,'A');assert.equal(recovery.receipt.note.html,'NUEVA');assert.equal(s.data[keys.BRIDGE_REV_PREFIX+'a'],undefined);
 s.fail(false);assert.equal(docs.applyBridge(receipt),true);assert.equal(docs.getContent('a'),'NUEVA');
 assert.equal(s.data[keys.DOC_PREFIX+'a'+keys.PREVIOUS_SUFFIX],'OLDER A');
});

test('confirmar el mismo texto local no necesita duplicarlo en un journal de recepción',()=>{
 const s=stores(),docs=s.make();docs.init();assert.equal(docs.saveContent('a','A','A'),true);
 // Force authoritative metadata even when the initial text was already identical.
 s.data[keys.META_PREFIX+'a']=JSON.stringify({id:'a',auto:'A',updated:1});
 s.fail(k=>k.startsWith(keys.BRIDGE_INBOUND_PREFIX));
 const receipt={opId:'own',revision:{epoch:'e',sequence:1},note:{id:'a',html:'A',auto:'A',updated:1,state:'active',received:false}};
 assert.equal(docs.applyBridge(receipt),true);assert.equal(docs.getContent('a'),'A');
});
