import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOperation,splitMessage,joinMessage} from '../src/bridge/protocol.js';
const op={protocol:1,opId:'op-1',clientId:'client-1',docId:'a',base:null,note:{id:'a',html:'hola',auto:'hola',updated:1,state:'active',received:false}};
test('acepta únicamente operaciones completas con documento coherente',()=>{
 assert.equal(validateOperation(op),true);
 assert.equal(validateOperation({...op,docId:'b'}),false);
 assert.equal(validateOperation({...op,note:{...op.note,state:'inventado'}}),false);
 assert.equal(validateOperation({...op,base:{epoch:'x',sequence:-1}}),false);
 assert.equal(validateOperation({...op,extra:'no permitido'}),false);
});
test('reconstruye mensajes grandes con Unicode y detecta fragmentos ausentes',()=>{
 const text='á🐈'.repeat(200000);const chunks=splitMessage({text});
 assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.bytes.length<=65536));
 assert.deepEqual(joinMessage(chunks),{text});
 assert.throws(()=>joinMessage(chunks.slice(0,-1)));
 assert.throws(()=>joinMessage([chunks[1],chunks[0],...chunks.slice(2)]));
 assert.throws(()=>joinMessage([chunks[0],chunks[0],...chunks.slice(2)]));
});
