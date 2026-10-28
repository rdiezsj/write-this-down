// Segunda pestaña real en el mismo perfil efímero (mismo almacenamiento y SW).
export async function openPage(t,url) {
    const {targetId}=await t.send('Target.createTarget',{url});
    const {sessionId}=await t.send('Target.attachToTarget',{targetId,flatten:false});
    let serial=0;const pending=new Map();
    const listener=message=>{
        if(message.method!=='Target.receivedMessageFromTarget'||message.params.sessionId!==sessionId)return;
        const reply=JSON.parse(message.params.message);
        pending.get(reply.id)?.(reply);pending.delete(reply.id);
        if(reply.method==='Runtime.exceptionThrown')t.errors.push(reply.params.exceptionDetails.text);
    };
    t.listeners.push(listener);
    const send=(method,params={})=>new Promise((resolve,reject)=>{
        const id=++serial;
        pending.set(id,reply=>reply.error?reject(new Error(reply.error.message)):resolve(reply.result));
        t.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
    });
    await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
    return {send,ev:async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;},
        close:async()=>{await t.send('Target.closeTarget',{targetId});t.listeners.splice(t.listeners.indexOf(listener),1);}};
}
