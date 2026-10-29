import keys from '../js/keys.js';
import {validateOperation} from './protocol.js';

// Synchronizes only after the caller has durably materialized each received note.
export function createBridgeClient({journal,transport,applyRemote,storage,onFirstConnect=async()=>true,onEpochChange=async()=>false,beforeSync=async()=>true,onStatus=()=>{}}) {
    let running=null, state='disconnected', retry=false, active=storage.getItem(keys.BRIDGE_CURSOR)!==null, lastStatus='';
    const conflicts=new Set();
    function status() {
        const recovered=journal.recover(),pending=recovered.pending.length+recovered.drafts.length;
        const paused=recovered.paused || recovered.drafts.length>0;
        return {state:paused || (pending && state==='connected')?'pending':state,pending,
            retry:retry || paused,active,conflicts:conflicts.size};
    }
    function refresh() {
        const value=status(),serialized=JSON.stringify(value);
        if(serialized!==lastStatus) {lastStatus=serialized;onStatus(value);}
    }
    function pause() {state='pending';retry=true;return false;}
    async function request(method,value) {
        try {return await transport.request(method,value);}
        catch(error) {state='disconnected';throw error;}
    }
    function preserved(receipt) {if(receipt.outcome==='conflict')conflicts.add(receipt.opId);}
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
                (receipt.authorDocId===undefined || [receipt.note.id,receipt.conflictId].includes(receipt.authorDocId)) &&
                receipt.conflict?.id===receipt.conflictId && validNote(receipt.conflict)));
    }
    async function run(manualRetry) {
        if(manualRetry || (!retry && state!=='connected')) {state='syncing';retry=false;}
        refresh();
        try {
            if(!await beforeSync()) return pause();
            const initial=journal.recover();
            if(initial.paused || initial.drafts.length) return pause();
            const hello=await request('hello');
            if(!hello || typeof hello.epoch!=='string' || !hello.epoch || !Number.isSafeInteger(hello.cursor) || hello.cursor<0)
                throw new Error('Respuesta inicial inválida');
            active=true;
            let current=position();
            if(current && current.epoch!==hello.epoch) {
                if(!await onEpochChange(hello.epoch,current)) return pause();
                current=null;
            }
            if(!current) {
                if(!await onFirstConnect(hello.epoch)) return pause();
                current={epoch:hello.epoch,cursor:0};
                storage.setItem(keys.BRIDGE_CURSOR,JSON.stringify(current));
            }
            while(journal.pending().length) {
                const operation=journal.pending()[0];
                if(!journal.sent(operation.opId)) return pause();
                const receipt=await request('apply',operation);
                if(!validReceipt(receipt,hello.epoch,operation.opId,operation.docId)) throw new Error('Recibo inválido');
                if(!await applyRemote(receipt) || !journal.rebase(receipt) || !journal.ack(receipt)) return pause();
                preserved(receipt);
            }
            const changes=await request('pull',current.cursor);
            if(!Array.isArray(changes)) throw new Error('Lista de cambios inválida');
            for(const change of changes) {
                if(change.cursor!==current.cursor+1 || !validReceipt(change.receipt,hello.epoch,change.receipt?.opId) ||
                    change.receipt.revision.sequence!==change.cursor) throw new Error('Cambio inválido');
                if(!await applyRemote(change.receipt)) return pause();
                preserved(change.receipt);
                current={epoch:hello.epoch,cursor:change.cursor};
                storage.setItem(keys.BRIDGE_CURSOR,JSON.stringify(current));
            }
            state='connected';retry=false;return true;
        } catch {if(state!=='disconnected')state='pending';retry=true;return false;}
    }
    function sync(manualRetry=false) {
        if(!running) running=run(manualRetry).finally(()=>{running=null;refresh();});
        return running;
    }
    return {sync,cursor,status,refresh};
}
