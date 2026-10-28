import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('normaliza HTML recibido sin ejecutar ni solicitar recursos externos',{timeout:30000},async()=>{
 const server=createServer(async(req,res)=>{if(req.url==='/utils.js'){const body=await readFile('src/js/components/utils.js');res.writeHead(200,{'Content-Type':'text/javascript'}).end(body);}else res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const profile=await mkdtemp(join(tmpdir(),'wtd-sanitize-'));const proc=spawn('google-chrome',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,url+'/'],{stdio:['ignore','ignore','pipe']});let stderr='';proc.stderr.on('data',data=>stderr+=data);let ws;
 try{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<80&&!stderr.includes('DevTools listening on');i++)await sleep(200);
  const port=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)?.[1];assert.ok(port);let page;
  for(let i=0;i<40&&!page;i++){const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();page=targets.find(t=>t.type==='page'&&t.url.startsWith(url));if(!page)await sleep(100);}assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await sleep(800);
  let serial=0;const pending=new Map(),requests=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://image.test/*']});
  const expression=`(async()=>{const util=(await import('${url}/utils.js')).default;const html='<div style="background:url(https://image.test/bg)" onclick="window.__bad=1">hola<img src="https://image.test/a.png"></div><script>window.__bad=1</script><div>mundo</div>';const safe=util.safeBridgeHtml(html);document.body.innerHTML=safe;const cases=['hola<div>mundo</div>','<div>primera</div><div><br></div><div>tercera</div>','&lt;img src=x&gt;<div>línea&nbsp;con espacios</div>'];const preserved=cases.every(input=>{const a=document.createElement('template'),b=document.createElement('template');a.innerHTML=input;b.innerHTML=util.safeBridgeHtml(input);return util.articleToText(a.content)===util.articleToText(b.content)});return {safe,text:document.body.textContent,bad:window.__bad||null,preserved}})()`;
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
  assert.equal(result.result.value.preserved,true);assert.match(result.result.value.text,/hola/);assert.match(result.result.value.text,/mundo/);assert.equal(result.result.value.bad,null);assert.doesNotMatch(result.result.value.safe,/<(?:img|script)|\bonclick=|\bstyle=/i);await sleep(400);assert.equal(requests.some(url=>url.startsWith('https://image.test/')),false);
 }finally{ws?.close();const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(proc.exitCode===null)proc.kill('SIGKILL');server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
});
