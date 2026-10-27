import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { component } from './helpers/component.mjs';
import keys from '../src/js/keys.js';

function directory(initial = {}) {
    const files = new Map(Object.entries(initial));
    let writes = 0, simultaneous = 0, maximum = 0;
    const thisDirectory = {
        name:'synthetic', files,
        async isSameEntry(other) { return this===other; },
        async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
        async *values() { for (const [name,value] of files) yield {name,kind:typeof value==='string'?'file':'directory'}; },
        async getDirectoryHandle(name,{create=false}={}) {
            if (!files.has(name) && create) files.set(name,directory());
            if (!files.has(name)) throw new DOMException('missing','NotFoundError');
            if (typeof files.get(name)==='string') throw new DOMException('file','TypeMismatchError');
            return files.get(name);
        },
        async getFileHandle(name,{create=false}={}) {
            const existing=[...files.keys()].find(n=>n.toLowerCase()===name.toLowerCase());
            if(existing) name=existing;
            if (!files.has(name) && !create) throw new DOMException('missing','NotFoundError');
            if (files.has(name) && typeof files.get(name)!=='string') throw new DOMException('directory','TypeMismatchError');
            if (!files.has(name)) files.set(name,'');
            return {
                async getFile() { const text=files.get(name);return {text:async()=>text}; },
                async createWritable() {
                    writes++;simultaneous++;maximum=Math.max(maximum,simultaneous);
                    if (thisDirectory.pause) await thisDirectory.pause();
                    let content='';
                    return { async write(text) { if(thisDirectory.failWrite)throw new Error('Disk full');content=text;await new Promise(r=>setTimeout(r,1)); },
                        async close() { files.set(name,content);simultaneous--; }, async abort() { simultaneous--; } };
                },
            };
        },
        async removeEntry(name) { files.delete(name); },
        get writes() { return writes; }, get maximum() { return maximum; },
    };
    return thisDirectory;
}
function setup(root=directory()) {
    const persisted=new Map();
    const documents=[{id:'a',text:'Same',updated:1}];
    let chosen=root;
    let failPersist=false;
    let locked=Promise.resolve();
    const navigator={locks:{request(name,run){const next=locked.then(run);locked=next.catch(()=>{});return next;}}};
    const indexedDB={open(){
        const request={result:{close(){},transaction(){
            const transaction={};
            const done=result=>{const request={result};queueMicrotask(()=>{request.onsuccess?.();transaction.oncomplete?.();});return request;};
            transaction.objectStore=()=>({
                get:key=>done(persisted.get(key)),
                put(value,key){if(failPersist)throw new DOMException('full','QuotaExceededError');persisted.set(key,{...value,entries:value.entries?JSON.parse(JSON.stringify(value.entries)):undefined,manifest:value.manifest?{...value.manifest}:undefined});return done();},
                delete(key){persisted.delete(key);return done();},
            });return transaction;
        }}};queueMicrotask(()=>request.onsuccess());return request;
    }};
    const util={firstLine:text=>text.split('\n')[0],fileName(base,ext,taken){let n=`${base}.${ext}`;for(let i=2;taken?.has(n);i++)n=`${base} (${i}).${ext}`;taken?.add(n);return n;}};
    const make=()=>component('folder',{documents:{},backup:{collect:()=>({format:'wtd-backup',version:1,documents:documents.map(d=>({...d}))})},
        util,keys,crypto:webcrypto,TextEncoder,navigator,window:{showDirectoryPicker:async()=>chosen},indexedDB});
    return {root,documents,make,persisted,choose:r=>{chosen=r;},failPersistence:value=>{failPersist=value;}};
}

test('conserva archivos y manifiesto ajenos, también nombres con distinta capitalización',async()=>{
    const docs=directory({'foreign.md':'FOREIGN','same.MD':'EXTERNAL'});
    const s=setup(directory({'documents':docs,'wtd-backup.json':'FOREIGN BACKUP'}));
    const folder=s.make();await folder.choose();
    assert.equal(docs.files.get('foreign.md'),'FOREIGN');
    assert.equal(docs.files.get('same.MD'),'EXTERNAL');
    assert.equal(s.root.files.get('wtd-backup.json'),'FOREIGN BACKUP');
    assert.ok([...docs.files.values()].includes('Same'));
    assert.ok([...s.root.files.values()].some(v=>typeof v==='string'&&v.includes('wtd-backup')));
    assert.equal(folder.conflicts(),true);
});

test('reconectar actualiza únicamente los archivos propios sin cambios externos',async()=>{
    const s=setup();await s.make().choose();
    s.documents[0].text='Same\nUPDATED';
    const folder=s.make();await folder.init();await folder.writeAll();
    const dir=s.root.files.get('documents');
    assert.equal(dir.files.size,1);assert.equal(dir.files.get('Same.md'),'Same\nUPDATED');
});

test('un cambio externo se conserva y la nota se escribe como otra copia estable',async()=>{
    const s=setup();const folder=s.make();await folder.choose();
    const dir=s.root.files.get('documents');dir.files.set('Same.md','EXTERNAL EDIT');
    s.documents[0].text='Same\nLOCAL EDIT';await folder.writeAll();await folder.writeAll();
    assert.equal(dir.files.get('Same.md'),'EXTERNAL EDIT');
    assert.equal([...dir.files.values()].filter(v=>v==='Same\nLOCAL EDIT').length,1);
    assert.equal(folder.conflicts(),true);
});

test('renombrar o eliminar solo limpia versiones propias intactas y preserva cambios externos',async()=>{
    const s=setup();const folder=s.make();await folder.choose();
    const dir=s.root.files.get('documents');dir.files.set('foreign.md','FOREIGN');
    s.documents[0].text='Renamed';await folder.writeAll();assert.equal(dir.files.has('Same.md'),false);
    dir.files.set('Renamed.md','EXTERNAL EDIT');s.documents.length=0;await folder.writeAll();
    assert.equal(dir.files.get('Renamed.md'),'EXTERNAL EDIT');assert.equal(dir.files.get('foreign.md'),'FOREIGN');
});

test('un manifiesto propio editado externamente se conserva en la reconexión',async()=>{
    const s=setup();await s.make().choose();
    s.root.files.set('wtd-backup.json','EXTERNAL BACKUP');const folder=s.make();await folder.init();await folder.writeAll();
    assert.equal(s.root.files.get('wtd-backup.json'),'EXTERNAL BACKUP');
    assert.equal([...s.root.files.keys()].filter(n=>n.endsWith('.json')).length,2);
});

test('serializa escrituras y stop espera a que termine la operación iniciada',async()=>{
    const s=setup();const folder=s.make();await folder.choose();
    const dir=s.root.files.get('documents');s.documents[0].text='Same\nNEW';
    await Promise.all([folder.writeAll(),folder.writeAll(),folder.writeAll()]);
    assert.equal(dir.maximum,1);
    const pending=folder.writeAll();await folder.stop();await pending;
    const writes=dir.writes;await folder.writeAll();assert.equal(dir.writes,writes);
});

test('desconectar desde otra pestaña no resucita el registro al acabar una escritura',async()=>{
    const s=setup();const a=s.make();await a.choose();const b=s.make();await b.init();
    const dir=s.root.files.get('documents');let release,entered;
    const waiting=new Promise(r=>{entered=r;});const gate=new Promise(r=>{release=r;});
    dir.pause=async()=>{entered();await gate;};
    const pending=a.writeAll();await waiting;const stopping=b.stop();release();await Promise.all([pending,stopping]);
    await a.writeAll();assert.equal(s.persisted.has(keys.FOLDER),false);
    assert.equal(a.state(),'paused');
});

test('seleccionar otra carpeta durante una escritura conserva la selección nueva',async()=>{
    const s=setup();const a=s.make();await a.choose();
    const dir=s.root.files.get('documents');let release,entered;
    const waiting=new Promise(r=>{entered=r;});const gate=new Promise(r=>{release=r;});
    dir.pause=async()=>{entered();await gate;};
    const pending=a.writeAll();await waiting;
    const other=directory();s.choose(other);const b=s.make();const selecting=b.choose();
    await new Promise(r=>setTimeout(r,2));release();await Promise.all([pending,selecting]);
    assert.equal(s.persisted.get(keys.FOLDER).handle,other);assert.equal(b.state(),'on');
});

test('un fallo de disco conserva la copia anterior y libera el escritor para reintentar',async()=>{
    const s=setup();const folder=s.make();await folder.choose();
    const dir=s.root.files.get('documents');dir.failWrite=true;s.documents[0].text='Same\nNEW';
    await folder.writeAll();assert.equal(folder.state(),'paused');assert.equal(dir.files.get('Same.md'),'Same');
    dir.failWrite=false;await folder.resume();assert.equal(dir.files.get('Same.md'),'Same\nNEW');assert.equal(dir.maximum,1);
});

test('no empieza a escribir si no puede conservar el registro de propiedad',async()=>{
    const s=setup();s.failPersistence(true);const folder=s.make();
    assert.equal(await folder.choose(),false);assert.equal(folder.state(),'paused');assert.equal(s.root.files.size,0);
    s.failPersistence(false);assert.equal(await folder.resume(),true);
});
