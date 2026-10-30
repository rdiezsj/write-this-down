// Prueba gráfica opcional: abre y cierra una ventana de Chrome con perfil desechable.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {resolveChrome} from '../browser/chrome.mjs';
const target=process.env.WTD_EXTENSION_TARGET||'chrome';
const executable=resolveChrome();
const profile=await mkdtemp(join(tmpdir(),'wtd-native-action-'));
const proc=spawn(executable,['--no-first-run','--remote-debugging-pipe','--enable-unsafe-extension-debugging',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let serial=0,buffer='',pending=new Map();
proc.stdio[4].on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\0'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},15000);pending.set(id,{resolve,reject,timer});proc.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
 const {id}=await send('Extensions.loadUnpacked',{path:process.cwd()+'/dist/'+target});
 const targets=await send('Target.getTargets',{filter:[{type:'tab'}]});
 await delay(1500);
 await send('Extensions.triggerAction',{id,targetId:targets.targetInfos[0].targetId});
 let views;
 for(let i=0;i<60;i++){views=(await send('Target.getTargets',{filter:[{}]})).targetInfos.filter(t=>t.url.startsWith('chrome-extension://'+id+'/'));if(views.some(v=>v.url.endsWith(target==='opera'?'popup.html':'index.html')))break;await delay(100);}
 const view=views.find(v=>v.url.endsWith(target==='opera'?'popup.html':'index.html'));assert.ok(view,'el botón no abrió el editor: '+JSON.stringify(views));
 const {sessionId}=await send('Target.attachToTarget',{targetId:view.targetId,flatten:true});
 let result;
 for(let i=0;i<60;i++){result=await send('Runtime.evaluate',{expression:"({editor:document.querySelector('article.content')?.isContentEditable,state:document.querySelector('.bridge-indicator')?.dataset.state,width:innerWidth,height:innerHeight})",returnByValue:true},sessionId);if(result.result.value?.editor&&result.result.value.state==='connected')break;await delay(100);}
 assert.equal(result.result.value.editor,true);assert.equal(result.result.value.state,'connected');
 console.log(JSON.stringify({target,native_action:true,...result.result.value}));
 await send('Browser.close');
}finally{
 if(proc.exitCode===null){const done=new Promise(r=>proc.once('exit',r));await Promise.race([done,delay(3000)]);if(proc.exitCode===null){proc.kill('SIGKILL');await done;}}
 for(const p of pending.values())clearTimeout(p.timer);
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
