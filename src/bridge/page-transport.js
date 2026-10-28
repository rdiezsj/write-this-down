import {createAssembler,splitMessage} from './protocol.js';

// The channel delivers only frames from the current page or extension port.
export function createPageTransport(channel) {
    const pending=new Map();
    let closed=false;
    const unlisten=channel.listen(frame=>{
        if(frame?.type!=='chunk' || !pending.has(frame.requestId)) return;
        const entry=pending.get(frame.requestId);
        try {
            const response=entry.assembler.push(frame.requestId,frame.chunk);
            if(response===null) return;
            if(response?.protocol!==1 || response.requestId!==frame.requestId || typeof response.ok!=='boolean')
                throw new Error('Respuesta inválida');
            pending.delete(frame.requestId);clearTimeout(entry.timer);
            if(response.ok) entry.resolve(response.result);
            else entry.reject(new Error('Error del puente'));
        } catch(error) {
            pending.delete(frame.requestId);clearTimeout(entry.timer);entry.reject(error);
        }
    });
    function request(method,value) {
        if(closed) return Promise.reject(new Error('Puente cerrado'));
        const requestId=crypto.randomUUID();
        const message={protocol:1,requestId,method};
        if(method==='pull') message.cursor=value;
        if(method==='apply') message.operation=value;
        return new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Puente no disponible'));},10000);
            pending.set(requestId,{resolve,reject,timer,assembler:createAssembler()});
            try { for(const chunk of splitMessage(message)) channel.send({type:'chunk',requestId,chunk}); }
            catch(error) {pending.delete(requestId);clearTimeout(timer);reject(error);}
        });
    }
    function close() {
        closed=true;unlisten();
        for(const entry of pending.values()) {clearTimeout(entry.timer);entry.reject(new Error('Puente cerrado'));}
        pending.clear();
    }
    return {request,close};
}
