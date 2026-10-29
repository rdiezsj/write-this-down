import keys from '../js/keys.js';

const same=(a,b)=>a && b && a.state===b.state && a.html===b.html && !!a.received===!!b.received;
const replaceable=key=>key===keys.BRIDGE_CURSOR || key.startsWith(keys.BRIDGE_OP_PREFIX) ||
    key.startsWith(keys.BRIDGE_REV_PREFIX) || key.startsWith(keys.BRIDGE_INBOUND_PREFIX);

// Persist the batch and old epoch before changing any synchronization metadata.
export function bootstrapLibrary({epoch,previous,storage,documents,journal,clientId}) {
    try {
        const notes=documents.snapshotForBridge();
        if(notes===null) return false;
        const operation=(note,author=clientId)=>({protocol:1,opId:crypto.randomUUID(),clientId:author,docId:note.id,base:null,note});
        let initial=storage.getItem(keys.BRIDGE_SNAPSHOT);
        if(initial===null) {
            initial=JSON.stringify({epoch,operations:notes.map(note=>operation(note))});
            storage.setItem(keys.BRIDGE_SNAPSHOT,initial);
        }
        const snapshot=JSON.parse(initial);
        if(!Array.isArray(snapshot.operations)) return false;
        const seed=snapshot.epoch===epoch?snapshot.operations:[];
        const raw=storage.getItem(keys.BRIDGE_BOOTSTRAP);
        let batch=raw===null?null:JSON.parse(raw);
        if(!batch || batch.epoch!==epoch) {
            const reset=!!previous && previous.epoch!==epoch;
            batch={epoch,reset,cleaned:!reset,operations:[]};
            if(reset) {
                const entries=[];
                for(let i=0;i<storage.length;i++) {
                    const key=storage.key(i);
                    if(replaceable(key) || key===keys.BRIDGE_BOOTSTRAP || key===keys.BRIDGE_SNAPSHOT)
                        entries.push([key,storage.getItem(key)]);
                }
                batch.archive={notes,entries};
                // Keep the last outstanding intent from each writer, including
                // an intent not currently visible in the shared local cache.
                const latest=new Map();
                for(const op of journal.pending()) latest.set(JSON.stringify([op.clientId,op.docId]),op.note);
                for(const note of latest.values()) if(!notes.some(current=>current.id===note.id && same(current,note))) batch.operations.push(operation(note,crypto.randomUUID()));
            }
        }
        if(!Array.isArray(batch.operations)) return false;
        const latest=new Map([...seed,...batch.operations].map(op=>[op.docId,op.note]));
        for(const note of notes) if(!same(latest.get(note.id),note)) batch.operations.push(operation(note,batch.reset?crypto.randomUUID():clientId));
        storage.setItem(keys.BRIDGE_BOOTSTRAP,JSON.stringify(batch));
        if(!batch.cleaned) {
            const archiveKey=keys.BRIDGE_RECOVERY_PREFIX+'epoch-'+epoch;
            if(storage.getItem(archiveKey)===null) storage.setItem(archiveKey,JSON.stringify(batch.archive));
            for(const [key,value] of batch.archive.entries) {
                // Do not remove an operation another tab wrote after the snapshot.
                if(replaceable(key) && storage.getItem(key)===value) storage.removeItem(key);
            }
            batch.cleaned=true;
            delete batch.archive;
            storage.setItem(keys.BRIDGE_BOOTSTRAP,JSON.stringify(batch));
        }
        for(const op of [...seed,...batch.operations]) if(!journal.prepare(op) || !journal.applied(op.opId)) return false;
        return true;
    } catch {return false;}
}
