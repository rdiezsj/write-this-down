import bridge from './bridge';
import app from './app';
import {t} from './i18n';

// Only interface state crosses this boundary; note text stays in the stores.
let current={state:'disconnected',pending:0,retry:false,active:false,conflicts:0};
function visible() {return current.active || current.pending>0 || current.state==='pending' || ['chrome-extension:','moz-extension:'].includes(location.protocol);}
function message() {
    if(!visible()) return '';
    if(current.state==='disconnected') return 'local bridge unavailable · notes remain in this browser';
    if(current.retry) return 'local bridge paused · export a backup or free space, then retry';
    if(current.pending || current.state==='pending') return 'changes pending';
    return current.state==='connected'?'local bridge connected':'connecting local bridge';
}
export default {
    init() {
        bridge.onStatus(status=>{
            const previous=current.conflicts;
            current=status;
            if(current.conflicts>previous) app.bridgeNotice('conflict preserved');
            app.refreshStatus();
        });
    },
    message,
    indicator() {
        if(!visible()) return null;
        return current.state==='connected' && !current.pending && !current.retry ? 'connected' : 'disconnected';
    },
    items() {
        if(!visible()) return [];
        const items=[{group:'documents',label:t(message()),run:()=>app.bridgeNotice(message())}];
        if(current.retry)items.push({group:'documents',label:t('retry local bridge'),run:()=>bridge.retry()});
        return items;
    },
};
