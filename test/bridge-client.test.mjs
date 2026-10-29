import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournal} from '../src/js/components/bridge-journal.js';
import {createBridgeClient} from '../src/bridge/client.js';

function store(){const data=new Map();return {get length(){return data.size;},key:n=>[...data.keys()][n]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
const operation={protocol:1,opId:'one',clientId:'client',docId:'a',base:null,note:{id:'a',html:'texto',auto:'texto',updated:1,state:'active',received:false}};
test('un fallo después del commit reintenta la misma operación sin perderla',async()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(operation);journal.applied('one');
 const ids=[],applied=[];let fails=true;const receipt={opId:'one',outcome:'accepted',revision:{epoch:'e',sequence:1},note:operation.note};
 const transport={async request(method,value){if(method==='hello')return {epoch:'e',cursor:0};if(method==='pull')return [];ids.push(value.opId);if(fails){fails=false;throw Error('desconectado');}return receipt;}};
 const client=createBridgeClient({journal,transport,applyRemote:async r=>{applied.push(r);return true;},storage});
 assert.equal(await client.sync(),false);assert.equal(journal.pending().length,1);
 assert.equal(await client.sync(),true);assert.deepEqual(ids,['one','one']);assert.deepEqual(applied,[receipt]);assert.equal(journal.pending().length,0);
});
test('si no puede conservar una actualización remota no avanza el cursor',async()=>{
 const storage=store(),journal=createJournal(storage),receipt={opId:'other',outcome:'accepted',revision:{epoch:'e',sequence:1},note:operation.note};
 let allow=false;const transport={async request(method){return method==='hello'?{epoch:'e',cursor:1}:[{cursor:1,receipt}];}};
 const client=createBridgeClient({journal,transport,applyRemote:async()=>allow,storage});
 assert.equal(await client.sync(),false);assert.equal(client.cursor(),0);allow=true;
 assert.equal(await client.sync(),true);assert.equal(client.cursor(),1);
});
test('una respuesta de otra instalación no confirma ni elimina el cambio local',async()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(operation);journal.applied('one');
 const transport={async request(method){return method==='hello'?{epoch:'actual',cursor:0}:{opId:'one',outcome:'accepted',revision:{epoch:'antigua',sequence:1},note:operation.note};}};
 const client=createBridgeClient({journal,transport,applyRemote:async()=>true,storage});
 assert.equal(await client.sync(),false);assert.equal(journal.pending().length,1);
});
test('envía las ediciones posteriores con la revisión confirmada de la anterior',async()=>{
 const storage=store(),journal=createJournal(storage),next={...operation,opId:'two',note:{...operation.note,html:'continuación'}};
 for(const item of [operation,next]){journal.prepare(item);journal.applied(item.opId);}
 const sent=[];const transport={async request(method,item){if(method==='hello')return {epoch:'e',cursor:0};if(method==='pull')return [];sent.push(item);return {opId:item.opId,outcome:'accepted',revision:{epoch:'e',sequence:sent.length},note:item.note};}};
 const client=createBridgeClient({journal,transport,applyRemote:async()=>true,storage});assert.equal(await client.sync(),true);
 assert.deepEqual(sent[1].base,{epoch:'e',sequence:1});assert.equal(sent[1].note.html,'continuación');
});
test('un recibo de otro documento no confirma la operación ni altera la copia local',async()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(operation);journal.applied('one');let applied=false;
 const transport={async request(method){return method==='hello'?{epoch:'e',cursor:0}:{opId:'one',outcome:'accepted',revision:{epoch:'e',sequence:1},note:{...operation.note,id:'otro'}};}};
 const client=createBridgeClient({journal,transport,applyRemote:async()=>{applied=true;return true;},storage});
 assert.equal(await client.sync(),false);assert.equal(applied,false);assert.equal(journal.pending().length,1);
});

test('publica estados pendientes y confirmados, y permite reintentar un fallo sin perder la cola',async()=>{
 const storage=store(),journal=createJournal(storage),events=[];let fail=true;
 const receipt={opId:'one',outcome:'accepted',revision:{epoch:'e',sequence:1},note:operation.note};
 const transport={async request(method){if(fail)throw Error('ausente');return method==='hello'?{epoch:'e',cursor:0}:method==='pull'?[]:receipt;}};
 const client=createBridgeClient({storage,journal,transport,applyRemote:async()=>true,onStatus:s=>events.push(s)});
 assert.equal(await client.sync(),false);assert.equal(client.status().retry,true);assert.equal(client.status().active,false);
 fail=false;assert.equal(await client.sync(),true);assert.equal(client.status().state,'connected');
 journal.prepare(operation);journal.applied(operation.opId);client.refresh();
 assert.equal(events.at(-1).state,'pending');assert.equal(events.at(-1).pending,1);
 assert.equal(await client.sync(),true);assert.equal(events.at(-1).state,'connected');assert.equal(events.at(-1).pending,0);assert.equal(events.at(-1).retry,false);
});
test('un journal preparado o corrupto se muestra pausado y nunca conectado',async()=>{
 const storage=store(),journal=createJournal(storage),events=[];journal.prepare(operation);
 const client=createBridgeClient({storage,journal,transport:{request(){throw Error('no debe enviar');}},applyRemote:async()=>true,onStatus:s=>events.push(s)});
 assert.equal(await client.sync(),false);assert.equal(client.status().state,'pending');assert.equal(client.status().pending,1);assert.equal(client.status().retry,true);
 storage.setItem('wtd.bridge.op.one','dañado');client.refresh();assert.equal(client.status().state,'pending');assert.equal(client.status().retry,true);
});
test('solo anuncia conflictos materializados y no repite el aviso al releer el feed',async()=>{
 const storage=store(),journal=createJournal(storage),events=[];journal.prepare(operation);journal.applied('one');
 const receipt={opId:'one',outcome:'conflict',revision:{epoch:'e',sequence:1},note:operation.note,conflictId:'conflict-one',conflict:{...operation.note,id:'conflict-one'}};
 let allow=false;const transport={async request(method){return method==='hello'?{epoch:'e',cursor:1}:method==='pull'?[{cursor:1,receipt}]:receipt;}};
 const client=createBridgeClient({storage,journal,transport,applyRemote:async()=>allow,onStatus:s=>events.push(s)});
 assert.equal(await client.sync(),false);assert.equal(client.status().conflicts,0);allow=true;
 assert.equal(await client.sync(),true);assert.equal(client.status().conflicts,1);
 assert.equal(events.at(-1).conflicts,1);
});
test('las comprobaciones periódicas sin cambios no repiten anuncios de conexión',async()=>{
 const storage=store(),journal=createJournal(storage),events=[];
 const client=createBridgeClient({storage,journal,transport:{async request(method){return method==='hello'?{epoch:'e',cursor:0}:[];}},applyRemote:async()=>true,onStatus:s=>events.push(s)});
 await client.sync();events.length=0;await client.sync();assert.equal(events.length,0);
});
test('un fallo persistente no repite anuncios en reintentos automáticos; el manual sí muestra progreso',async()=>{
 for(const localFailure of [false,true]){
  const storage=store(),journal=createJournal(storage),events=[];
  storage.setItem('wtd.bridge.cursor',JSON.stringify({epoch:'e',cursor:0}));
  const client=createBridgeClient({storage,journal,onStatus:s=>events.push(s),beforeSync:async()=>!localFailure,
   transport:{async request(){throw Error('ausente');}},applyRemote:async()=>true});
  await client.sync();assert.equal(client.status().retry,true);events.length=0;
  await client.sync();assert.equal(events.length,0);
  await client.sync(true);assert.equal(events[0].state,'syncing');assert.equal(events[0].retry,false);assert.equal(events.at(-1).retry,true);
 }
});
