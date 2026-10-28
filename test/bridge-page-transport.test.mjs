import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageTransport} from '../src/bridge/page-transport.js';
import {createAssembler,splitMessage} from '../src/bridge/protocol.js';

function channel() {
 const listeners=new Set(), sent=[];
 return {sent,send:frame=>sent.push(frame),listen:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},emit:frame=>listeners.forEach(fn=>fn(frame))};
}
test('correlaciona respuestas segmentadas con la solicitud correspondiente',async()=>{
 const wire=channel(), transport=createPageTransport(wire), pending=transport.request('pull',3);
 const assembler=createAssembler(),frame=wire.sent[0];
 const request=assembler.push(frame.requestId,frame.chunk);
 assert.equal(request.method,'pull');assert.equal(request.cursor,3);
 const value='á'.repeat(100000);
 for(const chunk of splitMessage({protocol:1,requestId:frame.requestId,ok:true,result:value})) wire.emit({type:'chunk',requestId:frame.requestId,chunk});
 assert.equal(await pending,value);transport.close();
});
test('descarta respuestas ajenas y rechaza solicitudes al cerrar',async()=>{
 const wire=channel(),transport=createPageTransport(wire),pending=transport.request('hello');
 for(const chunk of splitMessage({protocol:1,requestId:'otro',ok:true,result:{}}))wire.emit({type:'chunk',requestId:'otro',chunk});
 transport.close();await assert.rejects(pending);
});
