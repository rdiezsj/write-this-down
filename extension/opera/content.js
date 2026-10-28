// Runs only on the WTD page, never on other sites or subframes.
if(window.top===window && location.origin==='https://rdiezsj.github.io' && location.pathname.startsWith('/write-this-down/')) {
    let port;
    function connect() {
        if(port) return port;
        port=chrome.runtime.connect({name:'wtd-bridge-v1'});
        port.onMessage.addListener(frame=>{
            if(frame?.type==='chunk') window.postMessage({channel:'wtd-bridge-v1',direction:'response',frame},location.origin);
        });
        port.onDisconnect.addListener(()=>{port=null;});
        return port;
    }
    window.addEventListener('message',event=>{
        if(event.source!==window || event.origin!==location.origin || event.data?.channel!=='wtd-bridge-v1' ||
            event.data.direction!=='request' || event.data.frame?.type!=='chunk') return;
        try {connect().postMessage(event.data.frame);} catch {port=null;}
    });
}
