import documents from './documents';
import editor from './editor';
import keys from '../keys';
import {createPageTransport} from '../../bridge/page-transport';
import {createBridgeSession} from '../../bridge/session';

// The extension port and window channel carry local messages, never HTTP requests.
function channel() {
    if(location.protocol==='chrome-extension:' && chrome.runtime?.id) {
        let port=null,listener=null;
        return {
            listen(fn){listener=fn;return ()=>{listener=null;port?.disconnect();port=null;};},
            send(frame){
                if(!port) {
                    const current=chrome.runtime.connect({name:'wtd-bridge-v1'});
                    port=current;
                    current.onMessage.addListener(message=>listener?.(message));
                    current.onDisconnect.addListener(()=>{if(port===current)port=null;});
                }
                port.postMessage(frame);
            },
        };
    }
    return {
        listen(fn) {
            const receive=event=>{
                if(event.source===window && event.origin===location.origin && event.data?.channel==='wtd-bridge-v1' &&
                    event.data.direction==='response') fn(event.data.frame);
            };
            window.addEventListener('message',receive);
            return ()=>window.removeEventListener('message',receive);
        },
        send(frame){window.postMessage({channel:'wtd-bridge-v1',direction:'request',frame},location.origin);},
    };
}

let begin=null,session=null,retrySync=null;
const listeners=new Set();
function publish(status) {for(const listener of listeners)listener(status);}
export default {
    prepare() {
        if(begin || !navigator.locks || window.top!==window) return;
        let timer=null,stopped=false;
        const transport=createPageTransport(channel());
        session=createBridgeSession({storage:localStorage,documents,editor,transport,onPending:schedule,onStatus:publish});
        function schedule() {if(!stopped){clearTimeout(timer);timer=setTimeout(sync,400);}}
        async function sync(manualRetry=false) {
            if(stopped) return;
            try {
                await navigator.locks.request('wtd.bridge.sync',{ifAvailable:true},lock=>lock?session.sync(manualRetry):false);
            } catch { /* The editor retains its local copy and durable pending operations. */ }
            if(!stopped && localStorage.getItem(keys.BRIDGE_CURSOR)!==null) {
                clearTimeout(timer);timer=setTimeout(sync,2000);
            }
        }
        retrySync=()=>{clearTimeout(timer);return sync(true);};
        begin=()=>{
            window.addEventListener('focus',schedule);
            window.addEventListener('storage',()=>{session.refresh();schedule();});
            document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
            // A bfcache return resumes the same session and pending operations.
            window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
            window.addEventListener('pageshow',()=>{stopped=false;schedule();});
            schedule();
        };
    },
    start() {this.prepare();begin?.();},
    onStatus(listener) {listeners.add(listener);listener(session?.status() || {state:'disconnected',pending:0,retry:false,active:false,conflicts:0});return ()=>listeners.delete(listener);},
    retry() {return retrySync?.();},
};
