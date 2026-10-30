import test from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
import keys from '../src/js/keys.js';

test('la copia conserva tema y modo independientes',()=>{
 const storage={scheme:'nord','color-mode':'dark'};
 const documents={current:()=>null,list:()=>[],isBlank:()=>true};
 const backup=component('backup',{documents,util:{},keys,localStorage:storage});
 const data=backup.collect();
 assert.equal(data.settings.scheme,'nord');
 assert.equal(data.settings['color-mode'],'dark');
 storage.scheme='github'; storage['color-mode']='light';
 backup.apply(data);
 assert.equal(storage.scheme,'nord');
 assert.equal(storage['color-mode'],'dark');
});

test('el traslado conserva una edición pendiente que otra pestaña ha sustituido en la copia visible',()=>{
 const notes=new Map([['a',{id:'a',updated:2,text:'VERSIÓN VISIBLE'}]]);
 const operation={protocol:1,opId:'pending-author',clientId:'writer',docId:'a',base:null,
  note:{id:'a',html:'EDICIÓN PENDIENTE',auto:'EDICIÓN PENDIENTE',updated:1,state:'active',received:false}};
 const raw=JSON.stringify({state:'applied',order:1,operation});
 const recovery={[keys.BRIDGE_OP_PREFIX+operation.opId]:raw};
 const documents={current:()=>({id:'a'}),list:()=>[...notes.values()],getContent:id=>notes.get(id).text,
  isReceived:()=>false,bridgeRecoveryArchive:()=>recovery,isBlank:()=>false,
  add:doc=>{if(notes.has(doc.id))return false;notes.set(doc.id,doc);return doc;}};
 const backup=component('backup',{documents,util:{htmlToText:s=>s,textToHtml:s=>s},keys,localStorage:{}});
 const data=backup.collect();
 assert.ok(data.documents.some(doc=>doc.text==='EDICIÓN PENDIENTE'&&doc.received===true));
 assert.equal(data.recovery[keys.BRIDGE_OP_PREFIX+operation.opId],raw);
 const first=backup.apply(data);assert.equal(first.added,1);
 assert.equal(notes.get('a').text,'VERSIÓN VISIBLE');
 assert.equal(backup.apply(data).added,0);
});

test('backup y restore conservan la procedencia restrictiva de imágenes recibidas',()=>{
 const added=[];
 const documents={current:()=>({id:'a'}),list:()=>[{id:'a',updated:1}],getContent:()=>'<div>texto</div>',isReceived:()=>true,isBlank:()=>false,add:(doc,html)=>{added.push({doc,html});return doc;}};
 const backup=component('backup',{documents,util:{htmlToText:()=> 'texto',textToHtml:s=>s},keys,localStorage:{},zipSync:()=>{},strToU8:()=>{}});
 const result=backup.collect();assert.equal(result.documents[0].received,true);
 backup.apply(result);assert.equal(added[0].doc.received,true);
});

test('exportar pendientes no duplica el texto visible ni restaura borrados o registros inválidos',()=>{
 const op=(opId,html,state='active')=>({protocol:1,opId,clientId:'writer',docId:'a',base:null,
  note:{id:'a',html,auto:html,updated:1,state,received:false}});
 const recovery={
  [keys.BRIDGE_OP_PREFIX+'same']:JSON.stringify({state:'applied',operation:op('same','VISIBLE')}),
  [keys.BRIDGE_OP_PREFIX+'prepared']:JSON.stringify({state:'prepared',operation:op('prepared','PREPARADO')}),
  [keys.BRIDGE_OP_PREFIX+'removed']:JSON.stringify({state:'applied',operation:op('removed','NO RESTAURAR','removed')}),
  [keys.BRIDGE_OP_PREFIX+'invalid']:'{',
 };
 const documents={current:()=>({id:'a'}),list:()=>[{id:'a',updated:1}],getContent:()=> 'VISIBLE',
  isReceived:()=>false,bridgeRecoveryArchive:()=>recovery};
 const backup=component('backup',{documents,util:{htmlToText:s=>s},keys,localStorage:{}});
 const data=backup.collect();
 assert.deepEqual(Array.from(data.documents,doc=>doc.text),['VISIBLE','PREPARADO']);
 assert.equal(Object.keys(data.recovery).length,4);
});
