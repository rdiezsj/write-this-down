import test from 'node:test';
import assert from 'node:assert/strict';
import {senderAllowed,validateRequest} from '../src/bridge/transport.js';
const id='abcdefghijklmnopabcdefghijklmnop';
test('solo admite el panel y la página WTD principal del mismo perfil',()=>{
 assert.equal(senderAllowed({id,url:`chrome-extension://${id}/index.html`},id),true);
 assert.equal(senderAllowed({id,url:`chrome-extension://${id}/index.html`,tab:{id:4}},id),true);
 assert.equal(senderAllowed({id,url:'https://rdiezsj.github.io/write-this-down/',tab:{id:1},frameId:0},id),true);
 for(const sender of [
  {id,url:'https://rdiezsj.github.io/write-this-down-otro/',tab:{id:1},frameId:0},
  {id,url:'https://rdiezsj.github.io/otro/',tab:{id:1},frameId:0},
  {id,url:'https://rdiezsj.github.io/write-this-down/',tab:{id:1},frameId:1},
  {id:'otra',url:'https://rdiezsj.github.io/write-this-down/',tab:{id:1},frameId:0},
  {id,url:`chrome-extension://${id}/otra.html`},
 ]) assert.equal(senderAllowed(sender,id),false);
});
test('admite el dominio definitivo con HTTPS y rechaza otros orígenes y subframes',()=>{
 for(const url of ['https://writethisdown.eu/','https://writethisdown.eu/#s=nota'])
  assert.equal(senderAllowed({id,url,tab:{id:1},frameId:0},id),true);
 for(const url of ['http://writethisdown.eu/','https://writethisdown.eu:8443/','https://www.writethisdown.eu/','https://writethisdown.eu.ejemplo.com/'])
  assert.equal(senderAllowed({id,url,tab:{id:1},frameId:0},id),false);
 assert.equal(senderAllowed({id,url:'https://writethisdown.eu/',tab:{id:1},frameId:1},id),false);
 assert.equal(senderAllowed({id:'otra',url:'https://writethisdown.eu/',tab:{id:1},frameId:0},id),false);
});
test('rechaza comandos abiertos, campos extra y cursores inválidos',()=>{
 assert.equal(validateRequest({protocol:1,requestId:'r1',method:'hello'}),true);
 assert.equal(validateRequest({protocol:1,requestId:'r1',method:'pull',cursor:0}),true);
 assert.equal(validateRequest({protocol:1,requestId:'r1',method:'pull',cursor:-1}),false);
 assert.equal(validateRequest({protocol:1,requestId:'r1',method:'hello',path:'otra'}),false);
 assert.equal(validateRequest({protocol:1,requestId:'r1',method:'exec',code:'x'}),false);
});
test('solo ejecuta comandos validados y conserva el identificador de respuesta',async()=>{
 const {dispatch}=await import('../src/bridge/transport.js');
 const calls=[],database={handshake:async()=>{calls.push('hello');return {epoch:'e',cursor:0};},pull:async cursor=>{calls.push(cursor);return [];},apply:async op=>{calls.push(op);return {opId:op.opId};}};
 assert.deepEqual(await dispatch(database,{protocol:1,requestId:'r',method:'hello'}),{protocol:1,requestId:'r',ok:true,result:{epoch:'e',cursor:0}});
 await assert.rejects(()=>dispatch(database,{protocol:1,requestId:'r',method:'exec'}));
 assert.deepEqual(calls,['hello']);
});
