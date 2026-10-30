import {openDatabase} from './src/bridge/database.js';
import {createAssembler,splitMessage} from './src/bridge/protocol.js';
import {dispatch,senderAllowed} from './src/bridge/transport.js';

let database;
function coordinator() {
    if(!database) database=openDatabase().catch(error=>{database=null;throw error;});
    return database;
}

chrome.runtime.onConnect.addListener(port=>{
    if(port.name!=='wtd-bridge-v1' || !senderAllowed(port.sender,chrome.runtime.id,chrome.runtime.getURL('/'))) {
        port.disconnect();
        return;
    }
    const assembler=createAssembler();
    port.onMessage.addListener(async frame=>{
        const requestId=frame?.requestId;
        try {
            if(!frame || frame.type!=='chunk' || typeof requestId!=='string') throw new Error('Trama inválida');
            const message=assembler.push(requestId,frame.chunk);
            if(message===null) return;
            if(message.requestId!==requestId) throw new Error('Identificador incoherente');
            const result=await dispatch(await coordinator(),message);
            for(const chunk of splitMessage(result)) port.postMessage({type:'chunk',requestId,chunk});
        } catch {
            if(typeof requestId==='string' && requestId.length<=256) {
                const response={protocol:1,requestId,ok:false,error:'bridge-error'};
                try {for(const chunk of splitMessage(response)) port.postMessage({type:'chunk',requestId,chunk});} catch {}
            }
        }
    });
});
