import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Chromium's real IndexedDB, in a disposable profile. The server exposes only the three bridge modules.
test('coordinador IndexedDB confirma y recupera transacciones y recibos', {timeout:30000}, async()=>{
 const server=createServer(async(req,res)=>{
  const name=req.url.slice(1);
  if(name===''){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html>');return;}
  if(!['database.js','reconcile.js','protocol.js','js/keys.js'].includes(name)){res.writeHead(404).end();return;}
  try{const body=await readFile(name==='js/keys.js'?'src/js/keys.js':'src/bridge/'+name);res.writeHead(200,{'Content-Type':'text/javascript'}).end(body);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(join(tmpdir(),'wtd-idb-test-'));
 const proc=spawn('google-chrome',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,url+'/'],{stdio:['ignore','ignore','pipe']});
 let stderr='';proc.stderr.on('data',chunk=>stderr+=chunk);
 let ws;
 try{
  for(let i=0;i<80&&!stderr.includes('DevTools listening on');i++)await new Promise(r=>setTimeout(r,200));
  const address=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)?.[1];assert.ok(address,'Chrome no ha arrancado');
  let page;for(let i=0;i<40&&!page;i++){const targets=await(await fetch(`http://127.0.0.1:${address}/json`)).json();page=targets.find(t=>t.type==='page'&&t.url.startsWith(url));if(!page)await new Promise(r=>setTimeout(r,100));}assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await new Promise(r=>setTimeout(r,800));
  const response=new Promise((resolve,reject)=>{ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){if(m.error)reject(Error(m.error.message));else resolve(m.result);}};});
  const expression=`(async()=>{const {openDatabase}=await import('${url}/database.js');const db=await openDatabase();const h=await db.handshake();const note=(id,text)=>({id,html:text,auto:text,updated:1,state:'active',received:false});const op=(opId,id,base,text)=>({protocol:1,opId,clientId:'client-1',docId:id,base,note:note(id,text)});const first=await db.apply(op('one','a',null,'uno'));const repeated=await db.apply(op('one','a',null,'uno'));let reusedRejected=false;try{await db.apply(op('one','a',null,'otro'))}catch{reusedRejected=true}const writes=await Promise.all([db.apply(op('two','a',first.revision,'dos')),db.apply(op('three','a',first.revision,'tres'))]);const initial=await db.apply(op('u1','u',null,'igual'));const unchanged=await db.apply(op('u2','u',initial.revision,'igual'));const afterUnchanged=await db.apply(op('u3','u',unchanged.revision,'cambio'));const before=await db.pull(0);await db.apply(op('existing','conflict-clash',null,'original'));const count=(await db.pull(0)).length;let failed=false;try{await db.apply(op('clash','a',first.revision,'otro'))}catch{failed=true}const after=await db.pull(0);db.close();const reopened=await openDatabase();const saved=await reopened.pull(0);reopened.close();return {h,first,repeated,reusedRejected,writes,unchanged,afterUnchanged,before,failed,count,after,saved};})()`;
  ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  const result=await response;if(result.exceptionDetails)throw Error(result.exceptionDetails.text);const data=result.result.value;
  assert.ok(data.h.epoch);assert.deepEqual(data.first,data.repeated);assert.equal(data.reusedRejected,true);assert.deepEqual(data.writes.map(x=>x.outcome).sort(),['accepted','conflict']);
  assert.equal(data.unchanged.outcome,'unchanged');assert.equal(data.afterUnchanged.outcome,'accepted');assert.equal(data.before.length,6);assert.equal(data.failed,true);assert.equal(data.after.length,data.count);assert.deepEqual(data.saved,data.after);
 }finally{ws?.close();const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(proc.exitCode===null)proc.kill('SIGKILL');server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
});
