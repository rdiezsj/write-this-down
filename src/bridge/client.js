import keys from '../js/keys.js';
import {validateOperation} from './protocol.js';

// Synchronizes only after the caller has durably materialized each received note.
export function createBridgeClient({journal,transport,applyRemote,storage,onFirstConnect=async()=>true}) {
    let running=null, state='disconnected';
    function position() {
        const raw=storage.getItem(keys.BRIDGE_CURSOR);
        if(raw===null) return null;
        const value=JSON.parse(raw);
        if(!value || typeof value.epoch!=='string' || !value.epoch || !Number.isSafeInteger(value.cursor) || value.cursor<0)
            throw new Error('Cursor del puente dañado');
        return value;
    }
    function cursor() { try { return position()?.cursor || 0; } catch { return 0; } }
    function validReceipt(receipt,epoch,opId,expectedDocId) {
        const validNote=note=>note && validateOperation({protocol:1,opId,clientId:'receipt',docId:note.id,base:null,note});
        return receipt && receipt.opId===opId && ['accepted','unchanged','conflict'].includes(receipt.outcome) &&
            receipt.revision?.epoch===epoch && Number.isSafeInteger(receipt.revision.sequence) && receipt.revision.sequence>0 &&
            validNote(receipt.note) && (!expectedDocId || receipt.note.id===expectedDocId) &&
            (receipt.outcome!=='conflict' || (receipt.conflictId===`conflict-${opId}` &&
                receipt.conflict?.id===receipt.conflictId && validNote(receipt.conflict)));
    }
    async function run() {
        try {
            const initial=journal.recover();
            if(initial.paused || initial.drafts.length) {state='pending';return false;}
            const hello=await transport.request('hello');
            if(!hello || typeof hello.epoch!=='string' || !hello.epoch || !Number.isSafeInteger(hello.cursor) || hello.cursor<0)
                throw new Error('Respuesta inicial inválida');
            let current=position();
            if(current && current.epoch!==hello.epoch) {state='pending';return false;}
            if(!current) {
                if(!await onFirstConnect(hello.epoch)) {state='pending';return false;}
                current={epoch:hello.epoch,cursor:0};
                storage.setItem(keys.BRIDGE_CURSOR,JSON.stringify(current));
            }
            while(journal.pending().length) {
                const operation=journal.pending()[0];
                if(!journal.sent(operation.opId)) {state='pending';return false;}
                const receipt=await transport.request('apply',operation);
                if(!validReceipt(receipt,hello.epoch,operation.opId,operation.docId)) throw new Error('Recibo inválido');
                if(!await applyRemote(receipt) || !journal.rebase(receipt) || !journal.ack(receipt)) {state='pending';return false;}
            }
            const changes=await transport.request('pull',current.cursor);
            if(!Array.isArray(changes)) throw new Error('Lista de cambios inválida');
            for(const change of changes) {
                if(change.cursor!==current.cursor+1 || !validReceipt(change.receipt,hello.epoch,change.receipt?.opId) ||
                    change.receipt.revision.sequence!==change.cursor) throw new Error('Cambio inválido');
                if(!await applyRemote(change.receipt)) {state='pending';return false;}
                current={epoch:hello.epoch,cursor:change.cursor};
                storage.setItem(keys.BRIDGE_CURSOR,JSON.stringify(current));
            }
            state='connected';return true;
        } catch {state='disconnected';return false;}
    }
    function sync() {
        if(!running) running=run().finally(()=>{running=null;});
        return running;
    }
    return {sync,cursor,status:()=>({state,pending:journal.pending().length})};
}
