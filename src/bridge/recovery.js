import keys from '../js/keys.js';
import {validateOperation} from './protocol.js';

const get=(storage,key)=>storage.getItem?storage.getItem(key):storage[key];
const metadata=raw=>{try{return JSON.parse(raw)||{};}catch{return {};}};
export function inboundComplete(storage,record) {
    const entries=record.entries || [{note:record.receipt?.note}];
    return !!record.receipt?.revision && entries.every(entry=>{
        const known=metadata(get(storage,keys.BRIDGE_REV_PREFIX+entry.note?.id));
        return known.epoch===record.receipt.revision.epoch && known.sequence>=record.receipt.revision.sequence;
    });
}

// These read-only views also work when quota prevents creating ordinary notes.
export function bridgeRecoveryNotes(storage) {
    const result=[];
    function previous(opId,note,before,source) {
        if(typeof before?.content!=='string' || before.content===get(storage,keys.DOC_PREFIX+note?.id)) return;
        const old=metadata(before.metadata);
        result.push({source,kind:'before',from:note.id,note:{id:`previous-${opId}-${note.id}`,html:before.content,
            auto:old.auto||'',updated:old.updated||0,state:'active',received:true}});
    }
    for(const key of Object.keys(storage)) {
        try {
            if(key.startsWith(keys.BRIDGE_OP_PREFIX)) {
                const record=JSON.parse(get(storage,key)),op=record.operation;
                if(record.state!=='prepared' || !validateOperation(op)) continue;
                const meta=metadata(get(storage,keys.META_PREFIX+op.docId));
                const complete=op.note.state==='removed'?meta.removed===true:
                    meta.updated===op.note.updated && !meta.removed && get(storage,keys.DOC_PREFIX+op.docId)===op.note.html && !!meta.deleted===(op.note.state==='trash');
                if(!(complete && op.note.state==='removed'))previous(op.opId,op.note,record.before,key);
                const finishable=record.before && get(storage,keys.DOC_PREFIX+op.docId)===op.note.html &&
                    get(storage,keys.META_PREFIX+op.docId)===record.before.metadata;
                if(!complete && !finishable && op.note.state!=='removed') {
                    const note={...op.note,id:`recovered-${op.opId}`,state:'active',received:true};delete note.deleted;
                    result.push({source:key,kind:'draft',from:op.docId,note});
                }
            } else if(key.startsWith(keys.BRIDGE_INBOUND_PREFIX)) {
                const record=JSON.parse(get(storage,key));
                if(inboundComplete(storage,record)) continue;
                for(const entry of record.entries || [{note:record.receipt?.note,before:record.before}])
                    if(entry.note)previous(record.receipt.opId,entry.note,entry.before,key);
            }
        } catch { /* Malformed originals remain untouched and are included in backup recovery. */ }
    }
    return result;
}

export function recoverBridgeLibrary({storage,documents,journal}) {
    try {
        const state=journal.recover();
        if(state.paused) return false;
        const candidates=bridgeRecoveryNotes(storage);
        function keep(candidate) {
            const note=candidate.note,op={protocol:1,opId:note.id,clientId:'recovery',docId:note.id,base:null,note};
            if(documents.hasBridgeRecovery(note.id,candidate.from))return true;
            return journal.prepare(op) && documents.storeBridgeRecovery(note,candidate.from) && journal.applied(op.opId);
        }
        for(const candidate of candidates.filter(item=>item.kind==='before')) if(!keep(candidate))return false;
        for(const op of state.drafts) {
            const source=keys.BRIDGE_OP_PREFIX+op.opId,raw=storage.getItem(source),record=JSON.parse(raw);
            const archive=keys.BRIDGE_RECOVERY_PREFIX+op.opId;
            if(storage.getItem(archive)===null)storage.setItem(archive,JSON.stringify({source,raw}));
            const seedPresent=!record.before && documents.snapshotForBridge().some(note=>note.id===op.docId &&
                ['html','state','updated','deleted','received'].every(key=>note[key]===op.note[key]));
            if(documents.matchesBridgeNote(op.note) || seedPresent || documents.finishBridgePrepared(op.note,record.before)) {
                if(!journal.applied(op.opId))return false;
            } else {
                const draft=candidates.find(item=>item.kind==='draft' && item.source===source);
                if(op.note.state!=='removed' && (!draft || !keep(draft)))return false;
                // An uncommitted deletion is not replayed over a newer local state.
                if(!journal.retirePrepared(op.opId))return false;
            }
        }
        for(const key of Object.keys(storage).filter(key=>key.startsWith(keys.BRIDGE_INBOUND_PREFIX))) {
            const record=JSON.parse(storage.getItem(key));
            if(inboundComplete(storage,record))storage.removeItem(key);
        }
        return true;
    } catch {return false;}
}
