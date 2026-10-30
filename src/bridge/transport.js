import {validateOperation} from './protocol.js';

const ownKeys=(value,keys)=>Object.keys(value).every(key=>keys.includes(key));

export function senderAllowed(sender, extensionId, extensionURL=`chrome-extension://${extensionId}/`) {
    if(!sender || sender.id!==extensionId || typeof sender.url!=='string') return false;
    try {
        const url=new URL(sender.url);
        if(url.protocol==='chrome-extension:' || url.protocol==='moz-extension:') {
            const own=new URL(extensionURL);
            return url.protocol===own.protocol && url.host===own.host && url.pathname==='/index.html';
        }
        return url.origin==='https://writethisdown.eu' && !!sender.tab && sender.frameId===0;
    } catch {return false;}
}

export function validateRequest(message) {
    if(!message || typeof message!=='object' || Array.isArray(message) || message.protocol!==1 ||
        typeof message.requestId!=='string' || !message.requestId || message.requestId.length>256) return false;
    if(message.method==='hello') return ownKeys(message,['protocol','requestId','method']);
    if(message.method==='pull') return ownKeys(message,['protocol','requestId','method','cursor']) &&
        Number.isSafeInteger(message.cursor) && message.cursor>=0;
    if(message.method==='apply') return ownKeys(message,['protocol','requestId','method','operation']) && validateOperation(message.operation);
    return false;
}

export async function dispatch(database, message) {
    if(!validateRequest(message)) throw new Error('Solicitud del puente inválida');
    let result;
    if(message.method==='hello') result=await database.handshake();
    else if(message.method==='pull') result=await database.pull(message.cursor);
    else result=await database.apply(message.operation);
    return {protocol:1,requestId:message.requestId,ok:true,result};
}
