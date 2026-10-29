import keys from '../js/keys.js';
import {createJournal} from '../js/components/bridge-journal.js';
import {createBridgeClient} from './client.js';

// One session joins the existing editor to the local coordinator.
export function createBridgeSession({storage,documents,editor,transport,onPending=()=>{}}) {
    const journal=createJournal(storage);
    const clientId=crypto.randomUUID();
    let stopped=false,enabled=false;
    function revision(id) {
        const raw=storage.getItem(keys.BRIDGE_REV_PREFIX+id);
        return raw===null?null:JSON.parse(raw);
    }
    const recorder={
        prepare(note,base=revision(note.id)) {
            const recovered=journal.recover();
            if(recovered.paused || recovered.drafts.length) return false;
            const opId=crypto.randomUUID();
            return journal.prepare({protocol:1,opId,clientId,docId:note.id,base,note})?opId:false;
        },
        applied(token) {const saved=journal.applied(token);if(saved)onPending();return saved;},
    };
    function enable() {documents.setBridgeRecorder(recorder);enabled=true;}
    // A previously connected page keeps recording even with the extension absent.
    if(storage.getItem(keys.BRIDGE_CURSOR)!==null) enable();
    const client=createBridgeClient({storage,journal,transport,
        async onFirstConnect(epoch) {
            if(!editor.saveState()) return false;
            let snapshot=storage.getItem(keys.BRIDGE_SNAPSHOT);
            if(snapshot===null) {
                const notes=documents.snapshotForBridge();
                if(notes===null) return false;
                snapshot=JSON.stringify({epoch,operations:notes.map(note=>({protocol:1,opId:crypto.randomUUID(),clientId,docId:note.id,base:null,note}))});
                storage.setItem(keys.BRIDGE_SNAPSHOT,snapshot);
            }
            const saved=JSON.parse(snapshot);
            if(saved.epoch!==epoch || !Array.isArray(saved.operations)) return false;
            const current=documents.snapshotForBridge();
            if(current===null || current.length!==saved.operations.length || saved.operations.some(operation=>
                JSON.stringify(current.find(note=>note.id===operation.docId))!==JSON.stringify(operation.note))) return false;
            for(const operation of saved.operations) {
                if(!journal.prepare(operation) || !journal.applied(operation.opId)) return false;
            }
            enable();return true;
        },
        applyRemote(receipt) {
            // Conflict presentation/recovery is the next step: keep the durable
            // local operation and both coordinator versions until it is ready.
            if(receipt.outcome==='conflict') return false;
            return editor.receiveBridge(()=>{
                const pending=journal.recover();
                if(pending.paused || pending.drafts.length) return false;
                const waiting=pending.pending.filter(op=>op.docId===receipt.note.id && op.opId!==receipt.opId);
                if(waiting.length) return pending.pending.some(op=>op.opId===receipt.opId);
                const own=pending.pending.some(op=>op.opId===receipt.opId);
                return documents.applyBridge({...receipt,note:{...receipt.note,received:own?receipt.note.received:true}});
            });
        },
    });
    return {
        async sync() {
            if(stopped) return false;
            const result=await client.sync();
            if(!enabled && storage.getItem(keys.BRIDGE_CURSOR)!==null) enable();
            return result;
        },
        status:()=>client.status(),
        stop(){stopped=true;if(enabled)documents.setBridgeRecorder(null);transport.close?.();},
    };
}
