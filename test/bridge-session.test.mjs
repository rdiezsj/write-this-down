import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgeSession} from '../src/bridge/session.js';
import keys from '../src/js/keys.js';
function setup() {
 const data=new Map(),storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const notes=new Map([['a',{id:'a',html:'original',auto:'original',updated:1,state:'active',received:false}]]);
 let recorder,sequence=0;const changes=[],operations=[];
 const documents={snapshotForBridge:()=>[...notes.values()],setBridgeRecorder:r=>recorder=r,applyBridge:receipt=>{notes.set(receipt.note.id,receipt.note);return true;}};
 const editor={saveState:()=>true,receiveBridge:fn=>fn()};
 const transport={async request(method,value){if(method==='hello')return {epoch:'epoch',cursor:sequence};if(method==='pull')return changes.filter(c=>c.cursor>value);operations.push(value);const receipt={opId:value.opId,outcome:'accepted',revision:{epoch:'epoch',sequence:++sequence},note:value.note};changes.push({cursor:sequence,receipt});return receipt;}};
 const session=createBridgeSession({storage,documents,editor,transport});
 return {session,storage,notes,changes,operations,editor,transport,get recorder(){return recorder;},remote(html){changes.push({cursor:++sequence,receipt:{opId:'remote',outcome:'accepted',revision:{epoch:'epoch',sequence},note:{...notes.get('a'),html}}});}};
}
test('conecta biblioteca existente y registra ediciones antes de enviarlas',async()=>{
 const s=setup();assert.equal(await s.session.sync(),true);assert.equal(s.operations[0].note.html,'original');
 const note={...s.notes.get('a'),html:'edición'};const token=s.recorder.prepare(note);assert.ok(token);
 assert.equal(s.operations.length,1);assert.equal(s.recorder.applied(token),true);
 assert.equal(await s.session.sync(),true);assert.equal(s.operations.at(-1).note.html,'edición');
 assert.deepEqual(s.operations.at(-1).base,{epoch:'epoch',sequence:1});
 assert.ok(s.storage.getItem(keys.BRIDGE_SNAPSHOT));
});
test('recibe cambios remotos y conserva su procedencia restrictiva',async()=>{
 const s=setup();await s.session.sync();s.remote('desde panel');
 assert.equal(await s.session.sync(),true);assert.equal(s.notes.get('a').html,'desde panel');assert.equal(s.notes.get('a').received,true);
});
test('no aplica un cambio remoto sobre un borrador que no puede guardarse',async()=>{
 const s=setup();await s.session.sync();s.remote('desde panel');
 // Retener el cambio remoto sin avanzar el cursor.
 s.editor.receiveBridge=()=>false;assert.equal(await s.session.sync(),false);assert.equal(s.notes.get('a').html,'original');
});

test('un snapshot anterior sin cursor no sustituye una edición hecha después del cierre',async()=>{
 const s=setup(),old={...s.notes.get('a')};
 s.storage.setItem(keys.BRIDGE_SNAPSHOT,JSON.stringify({epoch:'epoch',operations:[{protocol:1,opId:'initial',clientId:'old-tab',docId:'a',base:null,note:old}]}));
 s.notes.set('a',{...old,html:'BORRADOR POSTERIOR'});
 assert.equal(await s.session.sync(),true);assert.equal(s.operations.at(-1).note.html,'BORRADOR POSTERIOR');
 assert.equal(s.notes.get('a').html,'BORRADOR POSTERIOR');assert.equal(JSON.parse(s.storage.getItem(keys.BRIDGE_CURSOR)).epoch,'epoch');
});

test('varias ediciones pendientes conservan el último texto con Storage enumerado al revés',async()=>{
 const s=setup();await s.session.sync();
 for(const html of ['primera edición','última edición']) {
  const note={...s.notes.get('a'),html},token=s.recorder.prepare(note);assert.ok(token);
  s.notes.set('a',note);assert.equal(s.recorder.applied(token),true);
 }
 const key=s.storage.key;s.storage.key=i=>key(s.storage.length-1-i);
 assert.equal(await s.session.sync(),true);
 assert.equal(s.notes.get('a').html,'última edición');
 assert.deepEqual(s.operations.slice(1).map(op=>op.note.html),['primera edición','última edición']);
});
test('la web sigue autónoma si nunca pudo conectar con la extensión',async()=>{
 const s=setup();s.transport.request=async()=>{throw Error('sin extensión');};
 assert.equal(await s.session.sync(),false);assert.equal(s.recorder,undefined);
 assert.equal(s.storage.getItem(keys.BRIDGE_SNAPSHOT),null);assert.equal(s.notes.get('a').html,'original');
});
