// Una intención pendiente de otra pestaña también debe viajar en el backup.
export const expect = { exported: true, restored: true, visiblePreserved: true, repeatAddsNothing: true };

export default async t => {
    await t.open();
    await t.ev(`(() => {
        const article = document.querySelector('article.content');
        article.textContent = 'VERSIÓN VISIBLE';
        article.dispatchEvent(new InputEvent('input', { bubbles: true }));
        dispatchEvent(new Event('pagehide'));
        const id = localStorage.getItem('wtd.current');
        const operation = {protocol:1,opId:'pending-browser',clientId:'other-writer',docId:id,base:null,
            note:{id,html:'EDICIÓN PENDIENTE',auto:'EDICIÓN PENDIENTE',updated:1,state:'active',received:false}};
        localStorage.setItem('wtd.bridge.op.pending-browser', JSON.stringify({state:'applied',order:1,operation}));
        window.__saved=[];
        const createURL=URL.createObjectURL.bind(URL);
        URL.createObjectURL=blob=>{window.__saved.push(blob);return createURL(blob)};
        HTMLAnchorElement.prototype.click=function(){};
    })()`);
    await t.click('.backup');
    await t.click('.backup-modal [data-choice="export"]');
    const exported = await t.ev(`window.__saved[0].text().then(s => {
        window.__backup=s;
        return JSON.parse(s).documents.some(doc => doc.text==='EDICIÓN PENDIENTE' && doc.received===true);
    })`);
    await t.ev(`localStorage.removeItem('wtd.bridge.op.pending-browser')`);
    const restore = () => t.ev(`(() => {
        const dt=new DataTransfer();
        dt.items.add(new File([window.__backup], 'wtd-backup.json', {type:'application/json'}));
        document.dispatchEvent(new DragEvent('drop', {dataTransfer:dt,bubbles:true,cancelable:true}));
    })()`);
    await restore(); await t.sleep(500);
    const restored = await t.ev(`localStorage.getItem('wtd.doc.recovered-pending-browser')==='EDICIÓN PENDIENTE' &&
        JSON.parse(localStorage.getItem('wtd.meta.recovered-pending-browser')).received===true`);
    const visiblePreserved = await t.ev(`document.querySelector('article.content').textContent==='VERSIÓN VISIBLE'`);
    const count = await t.ev(`JSON.parse(localStorage.getItem('wtd.docs')).length`);
    await restore(); await t.sleep(500);
    return { exported, restored, visiblePreserved,
        repeatAddsNothing: count === await t.ev(`JSON.parse(localStorage.getItem('wtd.docs')).length`) };
};
