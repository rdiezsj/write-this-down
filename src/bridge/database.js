import {validateOperation} from './protocol.js';
import {resolveOperation} from './reconcile.js';
import keys from '../js/keys.js';

const NAME = keys.BRIDGE_DB;
const request = item => new Promise((resolve,reject)=>{
    item.onsuccess=()=>resolve(item.result);
    item.onerror=()=>reject(item.error);
});
const completed = transaction => new Promise((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onabort=()=>reject(transaction.error || new Error('Transacción cancelada'));
    transaction.onerror=()=>{};
});

export async function openDatabase(factory=indexedDB) {
    const opening=factory.open(NAME,1);
    opening.onupgradeneeded=()=>{
        const db=opening.result;
        db.createObjectStore('notes',{keyPath:'id'});
        db.createObjectStore('receipts',{keyPath:'opId'});
        db.createObjectStore('changes',{keyPath:'cursor'});
        const meta=db.createObjectStore('meta');
        meta.put(crypto.randomUUID(),'epoch');
        meta.put(0,'cursor');
    };
    const db=await request(opening);
    return {
        async handshake() {
            const tx=db.transaction('meta','readonly'),done=completed(tx),meta=tx.objectStore('meta');
            const [epoch,cursor]=await Promise.all([request(meta.get('epoch')),request(meta.get('cursor'))]);
            await done;
            return {epoch,cursor};
        },
        async apply(operation) {
            if (!validateOperation(operation)) throw new Error('Operación del puente inválida');
            const tx=db.transaction(['notes','receipts','changes','meta'],'readwrite'),done=completed(tx);
            const notes=tx.objectStore('notes'),receipts=tx.objectStore('receipts'),changes=tx.objectStore('changes'),meta=tx.objectStore('meta');
            try {
                const previous=await request(receipts.get(operation.opId));
                if (previous) {
                    if (previous.operation !== JSON.stringify(operation)) throw new Error('Identificador de operación reutilizado');
                    await done;
                    return previous.receipt;
                }
                const [epoch,cursor,current]=await Promise.all([request(meta.get('epoch')),request(meta.get('cursor')),request(notes.get(operation.docId))]);
                const result=resolveOperation(current,operation,epoch);
                const revision={epoch,sequence:cursor+1};
                const receipt={opId:operation.opId,outcome:result.outcome,revision,note:result.note};
                if(result.conflict) {
                    receipt.authorDocId=result.authorDocId;
                    receipt.conflictId=result.conflict.id;
                    receipt.conflict=result.conflict;
                    notes.add({id:result.conflict.id,note:result.conflict,revision});
                }
                notes.put({id:result.note.id,note:result.note,revision});
                receipts.add({opId:operation.opId,operation:JSON.stringify(operation),receipt});
                changes.add({cursor:revision.sequence,receipt});
                meta.put(revision.sequence,'cursor');
                await done;
                return receipt;
            } catch(error) {
                try { tx.abort(); } catch {}
                await done.catch(()=>{});
                throw error;
            }
        },
        async pull(cursor) {
            if(!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Cursor inválido');
            const tx=db.transaction('changes','readonly'),done=completed(tx);
            const changes=await request(tx.objectStore('changes').getAll(IDBKeyRange.lowerBound(cursor,true)));
            await done;
            return changes;
        },
        close() { db.close(); },
    };
}
