import test from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
import keys from '../src/js/keys.js';
import es from '../src/js/translations/es.js';
import {createBridgeSession} from '../src/bridge/session.js';
import {createJournal} from '../src/js/components/bridge-journal.js';
import {resolveOperation} from '../src/bridge/reconcile.js';

function storage() {
 const data=new Map();let fail=()=>false;
 const methods={getItem:k=>data.get(k)??null,setItem(k,v){if(fail(k,v))throw Error('cuota');data.set(k,String(v));},removeItem:k=>data.delete(k),key:i=>[...data.keys()][i]??null};
 return {data,fail:fn=>fail=fn,value:new Proxy(methods,{get:(o,k)=>k==='length'?data.size:k in o?o[k]:data.get(k),set(o,k,v){methods.setItem(k,v);return true;},ownKeys:()=>[...data.keys()],getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})})};
}
function coordinator() {
 let epoch='first',sequence=0,notes=new Map(),receipts=new Map(),changes=[];const seen=[];let lose=false;
 return {seen,drop:()=>lose=true,reset(){epoch='second';sequence=0;notes=new Map();receipts=new Map();changes=[];},async request(method,op){
  if(method==='hello')return {epoch,cursor:sequence};if(method==='pull')return changes.filter(c=>c.cursor>op);
  seen.push(op.opId);let receipt=receipts.get(op.opId);
  if(!receipt){const result=resolveOperation(notes.get(op.docId),op,epoch),revision={epoch,sequence:++sequence};receipt={opId:op.opId,outcome:result.outcome,revision,note:result.note};notes.set(op.docId,{note:result.note,revision});if(result.conflict){receipt.authorDocId=result.authorDocId;receipt.conflictId=result.conflict.id;receipt.conflict=result.conflict;notes.set(result.conflict.id,{note:result.conflict,revision});}receipts.set(op.opId,receipt);changes.push({cursor:sequence,receipt});}
  if(lose){lose=false;throw Error('respuesta perdida');}return structuredClone(receipt);
 }};
}
function surface(server,text='común') {
 const s=storage();s.value.setItem(keys.DOCS,JSON.stringify([{id:'a',auto:text,updated:1}]));s.value.setItem(keys.DOC_PREFIX+'a',text);s.value.setItem(keys.CURRENT,'a');
 const util={firstLine:s=>s,htmlToText:s=>s,safeBridgeHtml:s=>s};
 const docs=component('documents',{localStorage:s.value,sessionStorage:{getItem:()=>null},keys,util,t:s=>s});docs.init();
 const editor={saveState:()=>true,documentId:()=>docs.current().id,receiveBridge(fn,redirect){if(!fn())return false;if(redirect&&docs.current().id===redirect.from)docs.setCurrent(redirect.to);return true;}};
 const session=createBridgeSession({storage:s.value,documents:docs,editor,transport:server});
 return {s,docs,editor,session,texts:()=>docs.list().map(d=>docs.getContent(d.id)),edit(text){assert.equal(docs.saveContent(docs.current().id,text,text),true);},restart(){return createBridgeSession({storage:s.value,documents:docs,editor,transport:server});}};
}
test('reconcilia dos bibliotecas con el mismo ID conservando ambas versiones sin duplicar al reintentar',async()=>{
 const db=coordinator(),a=surface(db,'WEB'),b=surface(db,'PANEL');await a.session.sync();
 assert.equal(await b.session.sync(),true);assert.deepEqual(new Set(b.texts()),new Set(['WEB','PANEL']));
 assert.equal(await b.session.sync(),true);assert.equal(b.docs.list().length,2);
 await a.session.sync();assert.deepEqual(new Set(a.texts()),new Set(['WEB','PANEL']));
});
test('encadena varias ediciones locales sobre una sola copia de conflicto y sigue el documento abierto',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 b.edit('primera B');b.edit('última B');a.edit('cambio A');await a.session.sync();
 assert.equal(await b.session.sync(),true);assert.deepEqual(new Set(b.texts()),new Set(['cambio A','última B']));
 assert.match(b.docs.current().id,/^conflict-/);assert.equal(b.docs.getContent(b.docs.current().id),'última B');
 await a.session.sync();assert.deepEqual(new Set(a.texts()),new Set(['cambio A','última B']));
});
test('la respuesta perdida conserva el mismo opId y no crea nuevas copias',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 a.edit('A');await a.session.sync();b.edit('B');db.drop();assert.equal(await b.session.sync(),false);
 const id=db.seen.at(-1);assert.equal(await b.session.sync(),true);assert.ok(db.seen.filter(x=>x===id).length===2);assert.equal(b.docs.list().length,2);
});
test('un tombstone concurrente conserva la edición como copia y no resucita el ID eliminado',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 b.edit('edición B');assert.equal(a.docs.destroy('a'),true);await a.session.sync();
 assert.equal(await b.session.sync(),true);assert.ok(!b.docs.list().some(d=>d.id==='a'));assert.ok(b.texts().includes('edición B'));
 assert.equal(b.docs.add({id:'a',updated:99999},'backup antiguo'),null);
});
export {storage,coordinator,surface};

test('un borrado atrasado conserva la edición remota como copia activa',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 a.edit('edición remota');await a.session.sync();assert.equal(b.docs.remove('a'),true);
 assert.equal(await b.session.sync(),true);assert.ok(b.texts().includes('edición remota'));assert.ok(b.docs.trash().some(d=>d.id==='a'));
});

test('una reinstalación con nueva epoch conserva biblioteca y cola sin confiar en revisiones antiguas',async()=>{
 const db=coordinator(),a=surface(db,'WEB');await a.session.sync();a.edit('pendiente WEB');
 db.reset();const b=surface(db,'PANEL NUEVO');await b.session.sync();
 assert.equal(await a.session.sync(),true);assert.deepEqual(new Set(a.texts()),new Set(['PANEL NUEVO','pendiente WEB']));
 assert.equal(JSON.parse(a.s.value.getItem(keys.BRIDGE_CURSOR)).epoch,'second');
 assert.ok([...a.s.data.keys()].some(k=>k.startsWith(keys.BRIDGE_RECOVERY_PREFIX)));
});
test('reanuda una conexión inicial interrumpida conservando la versión posterior de la biblioteca',async()=>{
 const db=coordinator(),a=surface(db,'ANTERIOR');
 const snapshot={epoch:'first',operations:[{protocol:1,opId:'seed',clientId:'previous',docId:'a',base:null,note:{id:'a',html:'ANTERIOR',auto:'ANTERIOR',updated:1,state:'active',received:false}}]};
 a.s.value.setItem(keys.BRIDGE_SNAPSHOT,JSON.stringify(snapshot));a.docs.saveContent('a','POSTERIOR','POSTERIOR');
 assert.equal(await a.session.sync(),true);assert.ok(a.texts().includes('POSTERIOR'));
 assert.equal(a.s.value.getItem(keys.BRIDGE_SNAPSHOT),JSON.stringify(snapshot));
});

test('un guardado preparado recupera texto anterior y nuevo tras fallo de metadatos',async()=>{
 const db=coordinator(),a=surface(db);await a.session.sync();
 a.s.fail(k=>k===keys.META_PREFIX+'a');assert.equal(a.docs.saveContent('a','BORRADOR','BORRADOR'),false);a.s.fail(()=>false);
 const session=a.restart();assert.equal(await session.sync(),true);
 assert.ok(a.texts().includes('BORRADOR'));assert.ok(a.texts().includes('común'));
 assert.equal([...a.s.data.keys()].filter(k=>k.startsWith(keys.BRIDGE_OP_PREFIX)).length,0);
});
test('sin espacio, los preparados siguen visibles y exportables sin tocar las claves originales',async()=>{
 const db=coordinator(),a=surface(db);await a.session.sync();
 a.s.fail(k=>k===keys.DOC_PREFIX+'a');assert.equal(a.docs.saveContent('a','BORRADOR SIN ESPACIO','BORRADOR SIN ESPACIO'),false);
 a.s.fail(()=>true);const before=new Map(a.s.data);a.docs.init();
 assert.ok(a.texts().includes('BORRADOR SIN ESPACIO'));assert.ok(a.texts().includes('común'));assert.deepEqual(a.s.data,before);
 const backup=component('backup',{documents:a.docs,keys,util:{htmlToText:s=>s},localStorage:a.s.value});
 const exported=backup.collect();assert.ok(exported.documents.some(d=>d.text==='BORRADOR SIN ESPACIO'));assert.ok(exported.recovery);
});

test('una recepción interrumpida se recupera una sola vez y conserva su versión anterior',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 a.edit('REMOTO');await a.session.sync();b.s.fail(k=>k===keys.META_PREFIX+'a');assert.equal(await b.session.sync(),false);b.s.fail(()=>false);
 const session=b.restart();assert.equal(await session.sync(),true);assert.deepEqual(new Set(b.texts()),new Set(['REMOTO','común']));
 assert.equal([...b.s.data.keys()].filter(k=>k.startsWith(keys.BRIDGE_INBOUND_PREFIX)).length,0);
 assert.equal(await session.sync(),true);assert.equal(b.docs.list().length,2);
});
test('restaurar un backup antiguo no sobrescribe notas activas, papelera ni tombstones',async()=>{
 const db=coordinator(),a=surface(db);await a.session.sync();a.edit('ACTUAL');
 const backup=component('backup',{documents:a.docs,keys,util:{htmlToText:s=>s,textToHtml:s=>s},localStorage:a.s.value});
 const data={format:'wtd-backup',version:1,documents:[{id:'a',updated:99999,text:'ANTIGUO'}]};
 assert.equal(backup.apply(data).skipped,1);assert.equal(a.docs.getContent('a'),'ACTUAL');
 a.docs.remove('a');assert.equal(backup.apply(data).skipped,1);a.docs.destroy('a');assert.equal(backup.apply(data).skipped,1);
});

test('editar una copia recuperada no vuelve a bloquear la recepción original pendiente',async()=>{
 const db=coordinator(),a=surface(db),b=surface(db);await a.session.sync();await b.session.sync();await a.session.sync();
 a.edit('REMOTO');await a.session.sync();b.s.fail(k=>k===keys.META_PREFIX+'a');assert.equal(await b.session.sync(),false);
 const session=b.restart();assert.equal(await session.sync(),false);
 const copy=b.docs.list().find(d=>d.id.startsWith('previous-'));assert.ok(copy);
 assert.equal(b.docs.saveContent(copy.id,'RECUPERADA EDITADA','RECUPERADA EDITADA'),true);b.s.fail(()=>false);
 assert.equal(await session.sync(),true);assert.ok(b.texts().includes('RECUPERADA EDITADA'));assert.ok(b.texts().includes('REMOTO'));
});

test('una nueva epoch conserva las últimas intenciones de varios autores además de la biblioteca visible',async()=>{
 const db=coordinator(),a=surface(db,'C visible');await a.session.sync();const journal=createJournal(a.s.value);
 for(const [clientId,html] of [['autor-A','A pendiente'],['autor-B','B pendiente']]){
  const note={id:'a',html,auto:html,updated:2,state:'active',received:false};
  const op={protocol:1,opId:clientId,clientId,docId:'a',base:JSON.parse(a.s.value.getItem(keys.BRIDGE_REV_PREFIX+'a')),note};
  assert.equal(journal.prepare(op),true);assert.equal(journal.applied(op.opId),true);
 }
 db.reset();assert.equal(await a.session.sync(),true);
 assert.deepEqual(new Set(a.texts()),new Set(['A pendiente','B pendiente','C visible']));
});

test('la lista identifica conflictos y recuperaciones sin cambiar el texto ni su primera línea',async()=>{
 const db=coordinator(),a=surface(db,'WEB'),b=surface(db,'PANEL');await a.session.sync();await b.session.sync();
 b.docs.storeBridgeRecovery({id:'recovered-example',html:'TEXTO RECUPERADO',updated:1},'a');
 let picker;const ui=component('docs',{documents:b.docs,app:{openPicker:value=>picker=value,formatKeys:s=>s},t:key=>es[key]||key,currentLanguage:()=> 'es'});
 ui.openList();assert.ok(picker.items.some(item=>item.label==='PANEL'&&item.hint.startsWith('copia de conflicto')));
 assert.ok(picker.items.some(item=>item.label==='TEXTO RECUPERADO'&&item.hint.startsWith('copia recuperada')));
 assert.ok(b.texts().includes('PANEL'));
});

test('un seed preparado con fallo de confirmación no duplica una nota de la biblioteca inicial',async()=>{
 const db=coordinator(),a=surface(db);a.s.fail((k,v)=>k.startsWith(keys.BRIDGE_OP_PREFIX)&&JSON.parse(v).state==='applied');
 assert.equal(await a.session.sync(),false);a.s.fail(()=>false);
 assert.equal(await a.session.sync(),true);assert.equal(a.docs.list().length,1);assert.equal(a.texts()[0],'común');
});
