import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {resolveChrome} from '../browser/chrome.mjs';
const target=process.env.WTD_EXTENSION_TARGET || 'opera';
const executable=target==='chrome' ? resolveChrome() : (process.env.CHROME || 'opera');
const dir=process.cwd()+'/dist/'+target,profile=await mkdtemp(join(tmpdir(),'wtd-extension-reinicio-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
let proc,ws;
async function launch(){
 proc=spawn(executable,['--headless=new',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,`--disable-extensions-except=${dir}`,`--load-extension=${dir}`,'--no-first-run','about:blank'],{stdio:'ignore'});
 for(let i=0;i<80;i++){await delay(250);try{const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(targets.length)return [...createHash('sha256').update(dir).digest().subarray(0,16)].map(x=>String.fromCharCode(97+(x>>4),97+(x&15))).join('');}catch{}}
 throw Error('No se detecta el service worker de la extensión');
}
async function stop(){if(!proc||proc.exitCode!==null)return;const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,delay(5000)]);if(proc.exitCode===null){proc.kill('SIGKILL');await done;}}
async function openPanel(id){
 const pageTarget=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(pageTarget.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let n=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 const page=target==='opera'?'popup.html':'index.html';
 const nav=await send('Page.navigate',{url:`chrome-extension://${id}/${page}`});assert.equal(nav.errorText,undefined);
 await delay(1000);
 return {send,ev:async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value};
}
const handshake=`new Promise(resolve=>{const port=chrome.runtime.connect({name:'wtd-bridge-v1'});const timer=setTimeout(()=>{port.disconnect();resolve(null)},5000);port.onDisconnect.addListener(()=>{clearTimeout(timer);resolve(null)});port.onMessage.addListener(frame=>{clearTimeout(timer);const result=JSON.parse(new TextDecoder().decode(new Uint8Array(frame.chunk.bytes)));port.disconnect();resolve(result)});const message={protocol:1,requestId:'probe',method:'hello'};const bytes=Array.from(new TextEncoder().encode(JSON.stringify(message)));port.postMessage({type:'chunk',requestId:'probe',chunk:{index:0,total:1,bytes}})})`;
try{
 const id=await launch();let tab=await openPanel(id);
 const first=await tab.ev(handshake);assert.equal(first?.ok,true);assert.ok(first.result.epoch);
 assert.equal(await tab.ev("document.querySelector('article.content')?.isContentEditable===true"),true);
 assert.equal(await tab.ev("(()=>{const e=document.querySelector('article.content');e.innerHTML='<div>nota offline</div>';e.dispatchEvent(new Event('input',{bubbles:true}));return e.textContent})()"),'nota offline');
 await delay(1200);
 await tab.ev("document.querySelector('.share').click();true");
 await delay(300);
 await tab.ev("document.querySelector('.share-modal [data-choice=public]').click();true");
 await delay(800);
 if(target==='chrome') {
  assert.equal((await tab.ev('chrome.sidePanel.getPanelBehavior()')).openPanelOnActionClick,true);
  assert.equal((await tab.ev('chrome.sidePanel.getOptions({})')).path,'index.html');
  const opened=await tab.send('Runtime.evaluate',{expression:'chrome.sidePanel.open({windowId:chrome.windows.WINDOW_ID_CURRENT}).then(()=>true)',awaitPromise:true,returnByValue:true,userGesture:true});
  assert.equal(opened.result?.value,true,JSON.stringify(opened));
 }
 const link=await tab.ev("document.querySelector('.link-output').value");
 assert.match(link,/^https:\/\/writethisdown\.eu\/#s=/);
 await tab.send('Browser.close');ws.close();
 for(let i=0;i<100&&proc.exitCode===null;i++)await delay(50);
 await stop();
 const id2=await launch();assert.equal(id2,id);tab=await openPanel(id2);
 assert.equal(await tab.ev("document.querySelector('article.content')?.textContent"),'nota offline');
 const second=await tab.ev(handshake);assert.equal(second?.ok,true);assert.equal(second.result.epoch,first.result.epoch);
 const result={...(target==='chrome'?{sidepanel_configured:true,sidepanel_open:true}:{popup_editor:true}),offline_first_open:true,offline_write:true,restart_persisted:true,public_link:true,bridge_worker:true,profile:'aislado y eliminado'};
 console.log(JSON.stringify(result));
}finally{ws?.close();await stop();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
