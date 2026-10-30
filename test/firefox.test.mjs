import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {senderAllowed} from '../src/bridge/transport.js';
import {component} from './helpers/component.mjs';

test('Firefox registra panel y botón sin popup ni permisos generales',()=>{
 const manifest=JSON.parse(readFileSync('extension/firefox/manifest.json','utf8'));
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.sidebar_action.default_panel,'index.html');
 assert.equal(manifest.sidebar_action.open_at_install,false);
 assert.equal(manifest.action.default_popup,undefined);
 assert.ok(manifest.action.default_icon['32']);
 assert.deepEqual(manifest.background.scripts,['background.js','action.js']);
 assert.equal(manifest.background.type,'module');
 assert.equal(manifest.background.service_worker,undefined);
 assert.deepEqual(manifest.permissions||[],[]);
 assert.equal(manifest.host_permissions,undefined);
 assert.deepEqual(manifest.content_scripts[0].matches,['https://writethisdown.eu/*']);
 assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required,['none']);
 assert.equal(manifest.version,JSON.parse(readFileSync('package.json','utf8')).version);
});
test('el botón de Firefox abre el panel directamente desde el gesto del usuario',()=>{
 let click,opened=0;
 vm.runInNewContext(readFileSync('extension/firefox/action.js','utf8'),{browser:{action:{onClicked:{addListener(fn){click=fn;}}},sidebarAction:{open(){opened++;return Promise.resolve();}}}});
 assert.equal(typeof click,'function');assert.equal(opened,0);click();assert.equal(opened,1);
});
test('Firefox acepta solo su UUID interno y su ID, nunca otra extensión o página',()=>{
 const id='wtd@writethisdown.eu',base='moz-extension://11111111-2222-3333-4444-555555555555/';
 assert.equal(senderAllowed({id,url:base+'index.html'},id,base),true);
 for(const sender of [{id:'otro',url:base+'index.html'},{id,url:base+'other.html'},{id,url:'moz-extension://other/index.html'},{id,url:'https://evil.example/index.html'}])
  assert.equal(senderAllowed(sender,id,base),false);
 assert.equal(senderAllowed({id,url:'https://writethisdown.eu/',tab:{id:1},frameId:0},id,base),true);
});
test('el panel Firefox muestra el estado del puente incluso antes de conectar',()=>{
 const ui=component('bridge-ui',{bridge:{},app:{},t:s=>s,location:{protocol:'moz-extension:'}});
 assert.ok(ui.message());assert.equal(ui.indicator(),'disconnected');
});
test('el editor Firefox conecta al puerto local de la extensión',()=>{
 let channel,connections=0,sent;
 const port={onMessage:{addListener(){}},onDisconnect:{addListener(){}},postMessage(frame){sent=frame;}};
 const window={};window.top=window;
 const bridge=component('bridge',{location:{protocol:'moz-extension:'},chrome:{runtime:{id:'wtd@writethisdown.eu',connect({name}){assert.equal(name,'wtd-bridge-v1');connections++;return port;}}},window,navigator:{locks:{}},localStorage:{},documents:{},editor:{},keys:{},
  createPageTransport(value){channel=value;return {};},createBridgeSession(){return {};}});
 bridge.prepare();channel.send({type:'probe'});assert.equal(connections,1);assert.equal(sent.type,'probe');
});
test('compartir desde Firefox produce un enlace público del dominio WTD',()=>{
 const source=readFileSync('src/js/components/sharing.js','utf8');
 const fn=source.match(/function linkFor\(fragment\) \{[\s\S]*?\n    \}/)[0];
 const context={location:{protocol:'moz-extension:',origin:'moz-extension://uuid',pathname:'/index.html'},facts:{url:'https://writethisdown.eu/'}};
 vm.runInNewContext(fn+'; result=linkFor("s=nota");',context);
 assert.equal(context.result,'https://writethisdown.eu/#s=nota');
});
