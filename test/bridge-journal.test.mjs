import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournal} from '../src/js/components/bridge-journal.js';
import keys from '../src/js/keys.js';
const op={protocol:1,opId:'o1',clientId:'c1',docId:'d1',base:null,note:{id:'d1',html:'texto',auto:'texto',updated:1,state:'active',received:false}};
function store(){const data=new Map();let failure=false;return {get length(){return data.size;},key:n=>[...data.keys()][n]??null,getItem:k=>data.get(k)??null,setItem(k,v){if(failure)throw Error('cuota');data.set(k,String(v));},removeItem(k){if(failure)throw Error('cuota');data.delete(k);},fail(v){failure=v;},data};}
test('conserva un preparado como borrador tras reiniciar y solo envía aplicados',()=>{
 const storage=store(),journal=createJournal(storage);assert.equal(journal.prepare(op),true);assert.deepEqual(journal.pending(),[]);
 const restored=createJournal(storage).recover();assert.deepEqual(restored.drafts,[op]);assert.equal(restored.paused,false);
 assert.equal(journal.applied('o1'),true);assert.deepEqual(createJournal(storage).pending(),[op]);
});
test('un fallo al confirmar conserva la operación pendiente',()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(op);journal.applied('o1');storage.fail(true);
 assert.equal(journal.ack({opId:'o1',revision:{epoch:'e',sequence:1}}),false);
 assert.deepEqual(journal.pending(),[op]);storage.fail(false);
 assert.equal(journal.ack({opId:'o1',revision:{epoch:'e',sequence:1}}),true);
 assert.deepEqual(journal.pending(),[]);assert.deepEqual(JSON.parse(storage.getItem(keys.BRIDGE_REV_PREFIX+'d1')),{epoch:'e',sequence:1});
});
test('rechaza una operación distinta con igual identificador y pausa ante datos corruptos',()=>{
 const storage=store(),journal=createJournal(storage);assert.equal(journal.prepare(op),true);assert.equal(journal.prepare({...op,note:{...op.note,html:'otro'}}),false);
 storage.setItem(keys.BRIDGE_OP_PREFIX+'mala','{');const state=journal.recover();assert.equal(state.paused,true);assert.ok(storage.getItem(keys.BRIDGE_OP_PREFIX+'mala'));
});
test('un recibo de otra epoch no reemplaza una revisión conocida ni borra la operación',()=>{
 const storage=store(),journal=createJournal(storage);storage.setItem(keys.BRIDGE_REV_PREFIX+'d1',JSON.stringify({epoch:'nueva',sequence:3}));journal.prepare(op);journal.applied('o1');
 assert.equal(journal.ack({opId:'o1',revision:{epoch:'antigua',sequence:1}}),false);
 assert.equal(JSON.parse(storage.getItem(keys.BRIDGE_REV_PREFIX+'d1')).epoch,'nueva');assert.equal(journal.pending().length,1);
});
test('un recibo de conflicto conserva la revisión de la copia antes de retirar la operación',()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(op);journal.applied('o1');
 const receipt={opId:'o1',outcome:'conflict',conflictId:'conflict-o1',revision:{epoch:'e',sequence:2}};
 assert.equal(journal.ack(receipt),true);
 assert.deepEqual(JSON.parse(storage.getItem(keys.BRIDGE_REV_PREFIX+'conflict-o1')),receipt.revision);
 assert.deepEqual(journal.pending(),[]);
});
test('una operación enviada conserva exactamente su contenido al reintentar',()=>{
 const storage=store(),journal=createJournal(storage);journal.prepare(op);journal.applied('o1');
 assert.equal(journal.sent('o1'),true);assert.deepEqual(createJournal(storage).pending(),[op]);
 assert.equal(journal.prepare({...op,note:{...op.note,html:'cambiado'}}),false);
});
test('el recibo avanza la base de ediciones aún no enviadas a la copia de conflicto',()=>{
 const storage=store(),journal=createJournal(storage),next={...op,opId:'o2',note:{...op.note,html:'continuación'}};
 journal.prepare(op);journal.applied('o1');journal.sent('o1');journal.prepare(next);journal.applied('o2');
 const receipt={opId:'o1',outcome:'conflict',conflictId:'conflict-o1',revision:{epoch:'e',sequence:3}};
 assert.equal(journal.rebase(receipt),true);
 const later=journal.pending().find(item=>item.opId==='o2');
 assert.equal(later.docId,'conflict-o1');assert.equal(later.note.id,'conflict-o1');assert.deepEqual(later.base,receipt.revision);assert.equal(later.note.html,'continuación');
});
test('una operación ya enviada nunca vuelve a ser modificable',()=>{
 const storage=store(),journal=createJournal(storage),next={...op,opId:'o2'};
 journal.prepare(op);journal.applied('o1');journal.sent('o1');journal.prepare(next);journal.applied('o2');journal.sent('o2');
 assert.equal(journal.applied('o2'),true);
 assert.equal(journal.rebase({opId:'o1',outcome:'accepted',revision:{epoch:'e',sequence:2}}),false);
});
