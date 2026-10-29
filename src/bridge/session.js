import keys from '../js/keys.js';
import {createJournal} from '../js/components/bridge-journal.js';
import {createBridgeClient} from './client.js';
import {bootstrapLibrary} from './bootstrap.js';
import {recoverBridgeLibrary} from './recovery.js';

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
            return journal.prepare({protocol:1,opId,clientId,docId:note.id,base,note},documents.bridgeBefore?.(note.id))?opId:false;
        },
        applied(token) {const saved=journal.applied(token);if(saved)onPending();return saved;},
        pending:(id,html)=>journal.recover().pending.some(op=>op.docId===id && op.note.html===html),
    };
    function enable() {documents.setBridgeRecorder(recorder);enabled=true;}
    // A previously connected page keeps recording even with the extension absent.
    if(storage.getItem(keys.BRIDGE_CURSOR)!==null) enable();
    function connectLibrary(epoch,previous=null) {
        if(!editor.saveState()) return false;
        if(!bootstrapLibrary({epoch,previous,storage,documents,journal,clientId})) return false;
        enable();return true;
    }
    const client=createBridgeClient({storage,journal,transport,
        beforeSync:()=>recoverBridgeLibrary({storage,documents,journal}),
        onFirstConnect:epoch=>connectLibrary(epoch),
        onEpochChange:(epoch,previous)=>connectLibrary(epoch,previous),
        applyRemote(receipt) {
            let redirect=null;
            return editor.receiveBridge(()=>{
                const pending=journal.recover();
                if(pending.paused || pending.drafts.length) return false;
                const source=pending.pending.find(op=>op.opId===receipt.opId);
                const waiting=pending.pending.filter(op=>op.docId===receipt.note.id && op.opId!==receipt.opId);
                if(!source && waiting.length) return false;
                const own=!!source;
                const incoming={...receipt,note:{...receipt.note,received:own?receipt.note.received:true}};
                const preserve=[];
                if(receipt.conflict) {
                    const copiedAuthor=source && (receipt.authorDocId?receipt.authorDocId===receipt.conflictId:source.note.state==='active');
                    const successors=waiting.filter(op=>copiedAuthor && op.clientId===source?.clientId);
                    const latest=successors.at(-1)?.note || source?.note;
                    incoming.conflict={...(successors.length?latest:receipt.conflict),id:receipt.conflictId,received:true};
                    if(waiting.some(op=>!copiedAuthor || op.clientId!==source?.clientId)) preserve.push(receipt.note.id);
                    const selected=editor.documentId?.() || documents.current?.().id;
                    if(copiedAuthor && selected===source.docId && (source.clientId===clientId || documents.getContent?.(source.docId)===latest?.html))
                        redirect={from:source.docId,to:receipt.conflictId};
                } else if(waiting.length) preserve.push(receipt.note.id);
                return documents.applyBridge(incoming,{preserve,focus:redirect});
            },()=>redirect);
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
