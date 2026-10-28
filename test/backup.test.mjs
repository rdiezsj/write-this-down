import test from 'node:test';
import assert from 'node:assert/strict';
import {component} from './helpers/component.mjs';
import keys from '../src/js/keys.js';

test('backup y restore conservan la procedencia restrictiva de imágenes recibidas',()=>{
 const added=[];
 const documents={current:()=>({id:'a'}),list:()=>[{id:'a',updated:1}],getContent:()=>'<div>texto</div>',isReceived:()=>true,isBlank:()=>false,add:(doc,html)=>{added.push({doc,html});return doc;}};
 const backup=component('backup',{documents,util:{htmlToText:()=> 'texto',textToHtml:s=>s},keys,localStorage:{},zipSync:()=>{},strToU8:()=>{}});
 const result=backup.collect();assert.equal(result.documents[0].received,true);
 backup.apply(result);assert.equal(added[0].doc.received,true);
});
