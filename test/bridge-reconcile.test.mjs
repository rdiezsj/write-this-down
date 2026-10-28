import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOperation} from '../src/bridge/reconcile.js';

const revision={epoch:'epoch-a',sequence:1};
const active=(html='texto')=>({id:'a',html,auto:html,updated:1,state:'active',received:false});
const operation=(note,base=revision,opId='op-1')=>({protocol:1,opId,clientId:'client-1',docId:'a',base,note});

test('acepta una edición basada en la revisión vigente',()=>{
    const result=resolveOperation({note:active(),revision},operation(active('nuevo')),'epoch-a');
    assert.equal(result.outcome,'accepted');assert.equal(result.note.html,'nuevo');
});
test('una edición obsoleta conserva las dos versiones con id estable',()=>{
    const result=resolveOperation({note:active('remoto'),revision:{epoch:'epoch-a',sequence:2}},operation(active('local')),'epoch-a');
    assert.equal(result.outcome,'conflict');assert.equal(result.note.html,'remoto');
    assert.equal(result.conflict.html,'local');assert.equal(result.conflict.id,'conflict-op-1');
});
test('una edición simultánea con borrado queda recuperable',()=>{
    const deleted={id:'a',state:'removed',updated:2,received:false};
    const result=resolveOperation({note:deleted,revision:{epoch:'epoch-a',sequence:2}},operation(active('borrador')),'epoch-a');
    assert.equal(result.note.state,'removed');assert.equal(result.conflict.html,'borrador');
});
test('un borrado obsoleto conserva la edición existente',()=>{
    const result=resolveOperation({note:active('edición'),revision:{epoch:'epoch-a',sequence:2}},operation({id:'a',state:'removed',updated:2,received:false}),'epoch-a');
    assert.equal(result.note.state,'removed');assert.equal(result.conflict.html,'edición');
});
test('no rebaja la procedencia restrictiva al llegar una edición sin indicador',()=>{
    const result=resolveOperation({note:{...active(),received:true},revision},operation(active('nuevo')),'epoch-a');
    assert.equal(result.note.received,true);
});
test('una epoch diferente no demuestra ascendencia',()=>{
    const result=resolveOperation({note:active('actual'),revision},operation(active('antiguo'),{epoch:'old',sequence:1}),'epoch-a');
    assert.equal(result.outcome,'conflict');assert.equal(result.conflict.html,'antiguo');
});
test('un tombstone obsoleto prevalece sobre la papelera sin resucitar notas',()=>{
    const trash={...active('papelera'),state:'trash',deleted:4};
    const removed={id:'a',state:'removed',updated:2,received:false};
    const result=resolveOperation({note:trash,revision:{epoch:'epoch-a',sequence:2}},operation(removed),'epoch-a');
    assert.equal(result.note.state,'removed');
    assert.equal(result.outcome,'accepted');
});
