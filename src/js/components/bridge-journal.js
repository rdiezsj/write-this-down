import keys from '../keys.js';
import {validateOperation} from '../../bridge/protocol.js';

// A prepared record contains the entire intended text before any local mutation.
export function createJournal(storage) {
    const keyFor = id => keys.BRIDGE_OP_PREFIX + id;
    function read(id) {
        const raw=storage.getItem(keyFor(id));
        if(raw === null) return null;
        const record=JSON.parse(raw);
        if(!record || !['prepared','applied','sent'].includes(record.state) || !validateOperation(record.operation) || record.operation.opId!==id)
            throw new Error('Journal dañado');
        return record;
    }
    function prepare(operation) {
        if(!validateOperation(operation)) return false;
        try {
            const existing=read(operation.opId);
            if(existing) return JSON.stringify(existing.operation)===JSON.stringify(operation);
            storage.setItem(keyFor(operation.opId),JSON.stringify({state:'prepared',operation}));
            return true;
        } catch {return false;}
    }
    function applied(id) {
        try {
            const record=read(id);
            if(!record) return false;
            if(record.state==='applied' || record.state==='sent') return true;
            storage.setItem(keyFor(id),JSON.stringify({...record,state:'applied'}));
            return true;
        } catch {return false;}
    }
    function recover() {
        const pending=[],drafts=[];
        let paused=false;
        for(let i=0;i<storage.length;i++) {
            const key=storage.key(i);
            if(!key?.startsWith(keys.BRIDGE_OP_PREFIX)) continue;
            try {
                const record=read(key.slice(keys.BRIDGE_OP_PREFIX.length));
                if(!record) {paused=true;continue;}
                (record.state==='prepared'?drafts:pending).push(record.operation);
            } catch {paused=true;}
        }
        return {pending,drafts,paused};
    }
    function pending() {
        const result=recover();
        return result.paused?[]:result.pending;
    }
    function sent(id) {
        try {
            const record=read(id);
            if(!record || record.state==='prepared') return false;
            if(record.state==='sent') return true;
            storage.setItem(keyFor(id),JSON.stringify({...record,state:'sent'}));
            return true;
        } catch {return false;}
    }
    function rebase(receipt) {
        try {
            const source=read(receipt.opId);
            if(!source || source.state!=='sent' || !receipt.revision ||
                !Number.isSafeInteger(receipt.revision.sequence) || receipt.revision.sequence<1 ||
                typeof receipt.revision.epoch!=='string' || !receipt.revision.epoch) return false;
            if(receipt.outcome==='conflict' && receipt.conflictId!==`conflict-${receipt.opId}`) return false;
            let after=false;
            for(let i=0;i<storage.length;i++) {
                const key=storage.key(i);
                if(!key?.startsWith(keys.BRIDGE_OP_PREFIX)) continue;
                const record=read(key.slice(keys.BRIDGE_OP_PREFIX.length));
                if(record.operation.opId===receipt.opId) {after=true;continue;}
                if(!after || record.operation.docId!==source.operation.docId ||
                    JSON.stringify(record.operation.base)!==JSON.stringify(source.operation.base)) continue;
                if(record.state!=='applied') return false;
                const docId=receipt.outcome==='conflict'?receipt.conflictId:record.operation.docId;
                const operation={...record.operation,docId,base:receipt.revision,note:{...record.operation.note,id:docId}};
                storage.setItem(key,JSON.stringify({...record,operation}));
            }
            return true;
        } catch {return false;}
    }
    function ack(receipt) {
        try {
            const record=read(receipt.opId),revision=receipt.revision;
            if(!record || !['applied','sent'].includes(record.state) || !revision || typeof revision.epoch!=='string' ||
                !Number.isSafeInteger(revision.sequence) || revision.sequence<1) return false;
            const ids=[record.operation.docId];
            if(receipt.outcome==='conflict') {
                if(receipt.conflictId!==`conflict-${receipt.opId}`) return false;
                ids.push(receipt.conflictId);
            }
            for(const id of ids) {
                const revisionKey=keys.BRIDGE_REV_PREFIX+id;
                const previous=storage.getItem(revisionKey);
                const old=previous===null?null:JSON.parse(previous);
                if(old && old.epoch!==revision.epoch) return false;
                if(!old || old.sequence<revision.sequence)
                    storage.setItem(revisionKey,JSON.stringify(revision));
            }
            storage.removeItem(keyFor(receipt.opId));
            return true;
        } catch {return false;}
    }
    return {prepare,applied,pending,sent,rebase,ack,recover};
}
