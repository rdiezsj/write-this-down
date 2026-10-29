import test from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
import {t,setLanguage} from '../src/js/components/i18n.js';
function setup(panel=false){
 let listener,retries=0,renders=0;const notices=[];
 const bridge={onStatus(fn){listener=fn;fn({state:'disconnected',pending:0,retry:false,active:false,conflicts:0});},retry(){retries++;}};
 const ui=component('bridge-ui',{bridge,app:{refreshStatus(){renders++;},bridgeNotice:s=>notices.push(s)},t,location:{protocol:panel?'chrome-extension:':'https:'}});
 ui.init();return {ui,notices,update:status=>listener({pending:0,retry:false,active:true,conflicts:0,...status}),retries:()=>retries,renders:()=>renders};
}
test('sin extensión la web no añade estado ni acciones; el panel sí muestra su conexión',()=>{
 const web=setup();assert.equal(web.ui.message(),'');assert.equal(web.ui.items().length,0);
 const panel=setup(true);assert.ok(panel.ui.message());
});
test('estado y menú cambian de idioma; reintentar solo aparece ante un fallo',()=>{
 const {ui,update,retries}=setup();setLanguage('en');update({state:'connected'});
 assert.equal(ui.message(),'local bridge connected');assert.equal(ui.items().length,1);
 update({state:'pending',pending:2});assert.equal(ui.message(),'changes pending');assert.equal(ui.items().length,1);
 update({state:'disconnected',retry:true});setLanguage('es');assert.equal(t(ui.message()),'puente local no disponible · las notas siguen en este navegador');
 const action=ui.items().find(item=>item.label==='reintentar puente local');assert.ok(action);action.run();assert.equal(retries(),1);
 setLanguage('en');assert.ok(ui.items().some(item=>item.label==='retry local bridge'));
});
test('conflictos confirmados se anuncian una vez sin repetir anuncios en cada sondeo',()=>{
 const {ui,update,notices,renders}=setup();update({state:'connected',conflicts:1});update({state:'connected',conflicts:1});
 assert.deepEqual(notices,['conflict preserved']);assert.equal(ui.message(),'local bridge connected');assert.ok(renders()>0);
});
test('consultar el estado del menú usa el aviso protegido y conserva la prioridad de guardado',()=>{
 let receive;const calls=[];
 const ui=component('bridge-ui',{t,location:{protocol:'https:'},bridge:{onStatus(fn){receive=fn;}},
  app:{refreshStatus(){},setStatus(){throw Error('no debe saltar la protección');},bridgeNotice:s=>calls.push(s)}});
 ui.init();receive({state:'connected',pending:0,retry:false,active:true,conflicts:0});ui.items()[0].run();
 assert.deepEqual(calls,['local bridge connected']);
});
