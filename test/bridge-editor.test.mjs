import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// A test-only copy substitutes the local origin; the production package keeps its strict HTTPS origin.
test('el editor real intercambia notas entre web y panel en Opera',{timeout:120000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'wtd-bridge-content-')),ext=join(root,'extension'),profile=join(root,'profile');
 const server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/write-this-down\//,'')||'index.html';if(name.includes('..'))throw Error();const body=await readFile(join('dist',name));const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream';res.writeHead(200,{'Content-Type':type}).end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 let proc,ws;
 try{
  await cp('dist/opera',ext,{recursive:true});
  const manifest=JSON.parse(await readFile(join(ext,'manifest.json'),'utf8'));manifest.content_scripts[0].matches=['http://127.0.0.1/*'];
  await writeFile(join(ext,'manifest.json'),JSON.stringify(manifest));
  const content=join(ext,'content.js');await writeFile(content,(await readFile(content,'utf8')).replace("location.origin==='https://writethisdown.eu'",`location.origin===${JSON.stringify(origin)}`));
  const transport=join(ext,'src/bridge/transport.js');await writeFile(transport,(await readFile(transport,'utf8')).replace("url.origin==='https://writethisdown.eu'",`url.origin===${JSON.stringify(origin)}`));
  proc=spawn('opera',['--headless=new',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`,'--no-first-run',origin+'/write-this-down/'],{stdio:['ignore','ignore','pipe']});let stderr='';proc.stderr.on('data',chunk=>stderr+=chunk);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<80&&!stderr.includes('DevTools listening on');i++)await sleep(200);
  const port=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)?.[1];assert.ok(port);
  let page;for(let i=0;i<40&&!page;i++){const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=targets.find(t=>t.type==='page'&&t.url.startsWith(origin));if(!page)await sleep(100);}assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});await sleep(1000);
  let serial=0;const errors=[];const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled')errors.push(m.params);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');
  await ev("localStorage.language='en';true");await send('Page.reload');await sleep(1000);
  const wait=async expression=>{for(let i=0;i<160;i++){if(await ev(expression))return;await sleep(200);}throw Error('No se recibió el cambio: '+expression+' '+JSON.stringify({errors,local:await ev("({keys:Object.keys(localStorage),status:document.querySelector('.status-message')?.textContent,body:!!document.querySelector('article.content')})")}));};
  await wait("!!localStorage.getItem('wtd.bridge.cursor')");
  const extensionId=[...createHash('sha256').update(ext).digest().subarray(0,16)].map(x=>String.fromCharCode(97+(x>>4),97+(x&15))).join('');
  const panelURL=`chrome-extension://${extensionId}/index.html`;
  const created=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  const panel=new WebSocket(created.webSocketDebuggerUrl);await new Promise((r,j)=>{panel.onopen=r;panel.onerror=j;});
  let n=0;const tasks=new Map();panel.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=tasks.get(m.id);tasks.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const panelSend=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;tasks.set(id,{resolve,reject});panel.send(JSON.stringify({id,method,params}));});
  const panelEval=async expression=>{const r=await panelSend('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const navigation=await panelSend('Page.navigate',{url:panelURL});assert.equal(navigation.errorText,undefined);

  try{
   for(let i=0;i<80;i++){try{if(await panelEval("!!localStorage.getItem('wtd.bridge.cursor')"))break;}catch{}await sleep(200);}
   assert.equal(await panelEval("!!localStorage.getItem('wtd.bridge.cursor')"),true);
   await ev("document.querySelector('article.content').innerHTML='<div>NOTA DESDE WEB</div>';(()=>{const range=document.createRange();range.setStart(document.querySelector('article.content').firstChild.firstChild,4);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range)})();document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   for(let i=0;i<80;i++){if(await panelEval("Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA DESDE WEB'))"))break;await sleep(200);}
   assert.equal(await panelEval("Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA DESDE WEB'))"),true);
   await panelEval("document.querySelector('article.content').innerHTML='NOTA DESDE PANEL';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await wait("Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA DESDE PANEL'))");
   assert.equal(await ev("document.querySelector('article.content').innerHTML"),'<div>NOTA DESDE WEB</div>');
   assert.equal(await ev('getSelection().anchorOffset'),4);
   const webId=await ev("localStorage.getItem('wtd.current')");
   await panelEval(`localStorage.setItem('wtd.current',${JSON.stringify(webId)});true`);
   await panelSend('Page.reload');
   for(let i=0;i<80;i++){try{if(await panelEval("document.querySelector('article.content')?.textContent==='NOTA DESDE WEB'"))break;}catch{}await sleep(200);}
   assert.equal(await panelEval("document.querySelector('article.content')?.textContent"),'NOTA DESDE WEB');
   await panelEval("document.querySelector('article.content').innerHTML='EDITADA DESDE PANEL';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await wait("document.querySelector('article.content').textContent==='EDITADA DESDE PANEL'");
   await wait("document.querySelector('.bridge-indicator').dataset.state==='connected'");
   await panelSend('Emulation.setDeviceMetricsOverride',{width:400,height:900,deviceScaleFactor:1,mobile:false});
   await sleep(200);
   const layout=await panelEval(`(()=>{const dot=document.querySelector('.bridge-indicator'),els=[document.querySelector('.status-left'),dot,document.querySelector('.language'),document.querySelector('.palette')],r=els.map(el=>el.getBoundingClientRect());return {visible:!dot.hidden,color:getComputedStyle(dot).backgroundColor,boxes:r.map(x=>({left:x.left,right:x.right})),message:document.querySelector('.status-message').textContent}})()`);
   assert.equal(layout.visible,true);assert.equal(layout.color,'rgb(255, 255, 255)');assert.equal(layout.message,'');
   assert.ok(layout.boxes.every((box,i)=>box.left>=0&&box.right<=400&&(!i||layout.boxes[i-1].right<=box.left)),JSON.stringify(layout));
   // Freeze the web bridge while both editors produce independent intentions.
   await ev("window.__originalPost=window.postMessage.bind(window);window.__holdBridge=true;window.postMessage=(data,...args)=>{if(window.__holdBridge&&data?.direction==='request'&&data?.channel==='wtd-bridge-v1')return;window.__originalPost(data,...args)};window.dispatchEvent(new Event('pagehide'));document.querySelector('article.content').innerHTML='DIVERGENCIA WEB';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await sleep(600);
   assert.equal(await ev("document.querySelector('.bridge-indicator').title"),'changes pending');
   assert.equal(await ev("getComputedStyle(document.querySelector('.bridge-indicator')).backgroundColor"),'rgb(0, 0, 0)');
   await panelEval("document.querySelector('article.content').innerHTML='DIVERGENCIA PANEL';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await sleep(600);
   for(let i=0;i<80;i++){await sleep(200);if(await panelEval("!Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'))"))break;}
   assert.equal(await panelEval("!Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'))"),true);
   await ev("window.__holdBridge=false;window.dispatchEvent(new Event('pageshow'));true");
   await wait("localStorage.getItem('wtd.current').startsWith('conflict-')&&!Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'))");
   assert.equal(await ev("document.querySelector('article.content').textContent"),'DIVERGENCIA WEB');
   await wait("Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k]==='DIVERGENCIA PANEL')");
   assert.equal(await ev("document.querySelector('.status-said').textContent"),'conflict preserved');
   // A subsequent storage refusal must outrank the still-visible conflict notice.
   await ev("window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('wtd.bridge.op.'))throw new DOMException('full','QuotaExceededError');return window.__setItem.call(this,k,v)};document.querySelector('article.content').innerHTML='DIVERGENCIA WEB SIN GUARDAR';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await sleep(600);
   assert.equal(await ev("document.querySelector('.status-message').textContent.includes('could not save this text')"),true);
   await ev("Storage.prototype.setItem=window.__setItem;document.querySelector('article.content').innerHTML='DIVERGENCIA WEB';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await sleep(600);

   await ev("document.querySelector('.documents').click();true");
   assert.equal(await ev("[...document.querySelectorAll('.picker-item .hint')].some(el=>/conflict|conflicto/.test(el.textContent))"),true);
   await ev("document.querySelector('.documents').click();true");
   // Reproduce a crash after writing the content but before metadata/applied.
   await ev(`(()=>{dispatchEvent(new Event('pagehide'));const id=localStorage.getItem('wtd.current'),key='wtd.meta.'+id,before={content:localStorage.getItem('wtd.doc.'+id),metadata:localStorage.getItem(key)},opId='interrupted-browser',note={id,html:'BORRADOR RECUPERADO',auto:'BORRADOR RECUPERADO',updated:Date.now(),state:'active',received:true};localStorage.setItem('wtd.bridge.op.'+opId,JSON.stringify({state:'prepared',order:Number(localStorage.getItem('wtd.bridge.order'))+1,operation:{protocol:1,opId,clientId:'interrupted',docId:id,base:JSON.parse(localStorage.getItem('wtd.bridge.rev.'+id)),note},before}));localStorage.setItem('wtd.doc.'+id,note.html);return true})()`);
   await send('Page.reload');await sleep(1000);
   await wait("document.querySelector('article.content')?.textContent==='BORRADOR RECUPERADO'&&!Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'))");
   await wait("Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.previous-')&&localStorage[k]==='DIVERGENCIA WEB')");
   // A transport failure keeps the local editor usable and offers an immediate retry.
   await ev("window.__savedPost=window.postMessage;window.postMessage=(data,...args)=>{if(data?.direction==='request')throw Error('test disconnect');window.__savedPost(data,...args)};window.dispatchEvent(new Event('focus'));true");
   await wait("document.querySelector('.bridge-indicator').title.includes('local bridge unavailable')");
   await ev("document.querySelector('.palette').click();true");
   assert.equal(await ev("[...document.querySelectorAll('.picker-item .label')].some(el=>el.textContent==='retry local bridge')"),true);
   await ev("window.postMessage=window.__savedPost;[...document.querySelectorAll('.picker-item')].find(el=>el.querySelector('.label').textContent==='retry local bridge').click();true");
   await wait("document.querySelector('.bridge-indicator').dataset.state==='connected'");
   assert.equal(await ev("document.querySelector('article.content').textContent"),'BORRADOR RECUPERADO');
   await ev("document.querySelector('.language').click();true");
   assert.equal(await ev("document.querySelector('.bridge-indicator').title"),'puente local conectado');
   assert.equal(await ev("document.querySelector('.status-message').textContent"),'');
   await ev("document.querySelector('.palette').click();true");
   assert.equal(await ev("[...document.querySelectorAll('.picker-item .label')].some(el=>el.textContent==='puente local conectado')"),true);
   await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('.language').click();true");
   // A bridge notice must not hide a local save failure.
   await ev("window.__storage=localStorage;Object.defineProperty(window,'localStorage',{configurable:true,value:new Proxy(window.__storage,{get:(s,k)=>typeof s[k]==='function'?s[k].bind(s):s[k],set:(s,k,v)=>{if(k==='wtd.doc.'+s['wtd.current'])throw new DOMException('full','QuotaExceededError');s[k]=v;return true}})});document.querySelector('article.content').innerHTML='BORRADOR SIN GUARDAR';document.querySelector('article.content').dispatchEvent(new InputEvent('input',{bubbles:true}));true");
   await wait("document.querySelector('.status-message').textContent.includes('could not save this text')");
   await ev("window.postMessage=(data,...args)=>{if(data?.direction==='request')throw Error('test disconnect');window.__savedPost(data,...args)};window.dispatchEvent(new Event('focus'));true");
   await sleep(800);
   assert.equal(await ev("document.querySelector('.status-message').textContent.includes('could not save this text')"),true);
   assert.equal(await ev("document.querySelector('article.content').textContent"),'BORRADOR SIN GUARDAR');
  }finally{panel.close();}

 }finally{ws?.close();if(proc){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,new Promise(r=>setTimeout(r,3000))]);if(proc.exitCode===null)proc.kill('SIGKILL');}server.close();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:500});}
});
