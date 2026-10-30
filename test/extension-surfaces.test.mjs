import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {senderAllowed} from '../src/bridge/transport.js';
const manifest=browser=>JSON.parse(readFileSync(`extension/${browser}/manifest.json`,'utf8'));

test('los tres navegadores tienen botón y panel y comparten identidad',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 for(const browser of ['opera','firefox','chrome']) {
  const m=manifest(browser);
  assert.equal(m.version,pkg.version);assert.equal(m.name,'Write this down!');
  assert.equal(m.action.default_icon['32'],'sidebar-32.png');
  assert.equal(m.host_permissions,undefined);
  assert.deepEqual(m.content_scripts[0].matches,['https://writethisdown.eu/*']);
  if(browser==='chrome') {
   assert.deepEqual(m.permissions,['sidePanel']);assert.equal(m.side_panel.default_path,'index.html');assert.equal(m.sidebar_action,undefined);
  } else {assert.equal(m.sidebar_action.default_panel,'index.html');assert.deepEqual(m.permissions||[],[]);}
  assert.equal(m.action.default_popup,browser==='opera'?'popup.html':undefined);
 }
});
test('Chrome configura la apertura nativa desde el botón sin abrir al instalar',()=>{
 const calls=[];
 const chrome={runtime:{getManifest:()=>manifest('chrome')},sidePanel:{setPanelBehavior(options){calls.push(options);return Promise.resolve();}}};
 vm.runInNewContext(readFileSync('extension/shared/action.js','utf8'),{chrome,console});
 assert.equal(calls.length,1);assert.equal(calls[0].openPanelOnActionClick,true);
});
test('Opera usa el popup sin invocar APIs de panel de Chrome o Firefox',()=>{
 const chrome={runtime:{getManifest:()=>manifest('opera')}};
 vm.runInNewContext(readFileSync('extension/shared/action.js','utf8'),{chrome,console});
});
test('el popup propio conserva acceso al puente sin aceptar otros emisores',()=>{
 const id='abcdefghijklmnopabcdefghijklmnop';
 assert.equal(senderAllowed({id,url:`chrome-extension://${id}/popup.html`},id),true);
 assert.equal(senderAllowed({id:'otro',url:`chrome-extension://${id}/popup.html`},id),false);
 assert.equal(senderAllowed({id,url:'chrome-extension://otro/popup.html'},id),false);
});
