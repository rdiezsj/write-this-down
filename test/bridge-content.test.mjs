import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// A test-only copy substitutes the local origin; the production package keeps its strict HTTPS origin.
test('content script y worker intercambian operaciones solo en la ruta autorizada',{timeout:60000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'wtd-bridge-content-')),ext=join(root,'extension'),profile=join(root,'profile');
 const server=createServer((req,res)=>res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>prueba sintética</title>'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let proc,ws;
 try{
  await cp('dist/opera',ext,{recursive:true});
  const manifest=JSON.parse(await readFile(join(ext,'manifest.json'),'utf8'));manifest.content_scripts[0].matches=['http://127.0.0.1/*'];
  await writeFile(join(ext,'manifest.json'),JSON.stringify(manifest));
  const content=join(ext,'content.js');await writeFile(content,(await readFile(content,'utf8')).replace("location.origin==='https://rdiezsj.github.io'",`location.origin===${JSON.stringify(origin)}`));
  const transport=join(ext,'src/bridge/transport.js');await writeFile(transport,(await readFile(transport,'utf8')).replace("url.protocol==='https:' && url.hostname==='rdiezsj.github.io' && url.port===''",`url.origin===${JSON.stringify(origin)}`));
  proc=spawn('opera',['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run',origin+'/write-this-down/'],{stdio:['ignore','ignore','pipe']});let stderr='';proc.stderr.on('data',chunk=>stderr+=chunk);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<80&&!stderr.includes('DevTools listening on');i++)await sleep(200);
  const port=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)?.[1];assert.ok(port);
  let page;for(let i=0;i<40&&!page;i++){const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=targets.find(t=>t.type==='page'&&t.url.startsWith(origin));if(!page)await sleep(100);}assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await sleep(1000);
  let serial=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  const run=message=>ev(`new Promise(resolve=>{const request=${JSON.stringify(message)};const timer=setTimeout(()=>resolve(null),10000);const parts=[];function receive(e){if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='wtd-bridge-v1'||e.data.direction!=='response'||e.data.frame?.requestId!==request.requestId)return;const chunk=e.data.frame.chunk;if(chunk.index!==parts.length){clearTimeout(timer);resolve(null);return}parts.push(chunk.bytes);if(parts.length!==chunk.total)return;removeEventListener('message',receive);clearTimeout(timer);const length=parts.reduce((sum,p)=>sum+p.length,0),bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}resolve(JSON.parse(new TextDecoder().decode(bytes)))}addEventListener('message',receive);const bytes=new TextEncoder().encode(JSON.stringify(request)),total=Math.max(1,Math.ceil(bytes.length/65536));for(let index=0;index<total;index++)postMessage({channel:'wtd-bridge-v1',direction:'request',frame:{type:'chunk',requestId:request.requestId,chunk:{index,total,bytes:Array.from(bytes.subarray(index*65536,(index+1)*65536))}}},location.origin)})`);
  const hello=await run({protocol:1,requestId:'first',method:'hello'});assert.equal(hello?.ok,true);assert.ok(hello.result.epoch);
  const operation={protocol:1,opId:'synthetic',clientId:'test',docId:'a',base:null,note:{id:'a',html:'texto sintético',auto:'texto sintético',updated:1,state:'active',received:false}};
  const applied=await run({protocol:1,requestId:'write',method:'apply',operation});assert.equal(applied?.result.note.html,'texto sintético');
  const pulled=await run({protocol:1,requestId:'read',method:'pull',cursor:0});assert.equal(pulled?.result[0].receipt.note.html,'texto sintético');
  const large={...operation,opId:'large',docId:'large',note:{...operation.note,id:'large',html:'ñ🙂'.repeat(200000),auto:'larga'}};
  const big=await run({protocol:1,requestId:'big',method:'apply',operation:large});assert.equal(big?.result.note.html,large.note.html);
  await send('Page.navigate',{url:origin+'/write-this-down-otro/'});await sleep(800);
  assert.equal(await run({protocol:1,requestId:'outside',method:'hello'}),null);
 }finally{ws?.close();if(proc){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(proc.exitCode===null)proc.kill('SIGKILL');}server.close();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
});
