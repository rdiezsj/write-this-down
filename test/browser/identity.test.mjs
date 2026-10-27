// El arranque de WTD usa su propio almacenamiento y no acepta traslados de otro sitio.
import { deflateSync, strToU8 } from 'fflate';

export const expect = {
    title: 'Write This Down - Online Text Editor',
    oldDataIgnored: true, ownStorage: true, persisted: true, folderDatabase: true,
    fontLoaded: true, backupFormat: 'wtd-backup', backupName: true,
    zipName: true, zipManifest: true, imported: true, transferIgnored: true,
};

export default async t => {
    await t.open();
    await t.ev(`localStorage.clear(); localStorage['other.docs'] = JSON.stringify([{id:'old',auto:'OLD NOTE',updated:1}]); localStorage['other.current']='old'; localStorage['other.doc.old']='<div>OLD NOTE</div>'`);
    await t.reload();
    const out = {
        title: await t.ev('document.title'),
        oldDataIgnored: !(await t.ev(`document.querySelector('article').textContent`)).includes('OLD NOTE'),
    };
    await t.focus(); await t.insert('WTD identity check', 1000); await t.reload();
    out.ownStorage = await t.ev(`!!localStorage['wtd.docs'] && !!localStorage['wtd.doc.'+localStorage['wtd.current']]`);
    out.persisted = await t.ev(`document.querySelector('article').textContent.includes('WTD identity check')`);
    out.folderDatabase = await t.ev(`indexedDB.databases().then(d => d.some(x => x.name === 'wtd'))`);
    out.fontLoaded = await t.ev(`document.fonts.load('14px "WTD Mono"').then(f => f.length > 0 && f.every(x => x.status === 'loaded'))`);
    await t.ev(`window.__saved=[]; window.__urls=new Map(); URL.createObjectURL=b=>{let u='blob:wtd-'+window.__saved.length;window.__urls.set(u,b);return u}; URL.revokeObjectURL=()=>{}; HTMLAnchorElement.prototype.click=function(){window.__saved.push({name:this.download,blob:window.__urls.get(this.href)})}`);
    await t.click('.backup');
    await t.ev(`document.querySelector('.backup-modal [data-choice="export"]').click()`);
    out.backupName = await t.ev(`/^wtd-backup-\\d{4}-\\d{2}-\\d{2}\\.json$/.test(window.__saved[0].name)`);
    out.backupFormat = await t.ev(`window.__saved[0].blob.text().then(s=>JSON.parse(s).format)`);
    await t.click('.backup');
    await t.ev(`document.querySelector('.backup-modal [data-choice="export-zip"]').click()`);
    out.zipName = await t.ev(`/^wtd-\\d{4}-\\d{2}-\\d{2}\\.zip$/.test(window.__saved[1].name)`);
    // Los nombres del directorio ZIP no están comprimidos.
    out.zipManifest = await t.ev(`window.__saved[1].blob.arrayBuffer().then(b=>new TextDecoder().decode(b).includes('wtd-backup.json'))`);
    await t.ev(`(async () => { const data = JSON.parse(await window.__saved[0].blob.text()); data.documents = [{id:'restored',text:'RESTORED WTD NOTE',updated:1}]; const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify(data)], 'wtd-backup.json', {type:'application/json'})); document.dispatchEvent(new DragEvent('drop', {dataTransfer:dt,bubbles:true,cancelable:true})); })()`);
    await t.sleep(500);
    out.imported = await t.ev(`JSON.parse(localStorage['wtd.docs']).some(d=>d.id==='restored') && localStorage['wtd.doc.restored'].includes('RESTORED WTD NOTE')`);
    await t.shot('wtd-identity');
    const pack = Buffer.from(deflateSync(strToU8(JSON.stringify({format:'wtd-backup',version:1,documents:[{id:'transfer',text:'SHOULD NOT IMPORT',updated:1}]})))).toString('base64url');
    await t.goto('/#m=1.' + pack);
    out.transferIgnored = await t.ev(`!JSON.parse(localStorage['wtd.docs']).some(d=>d.id==='transfer') && document.querySelector('article').textContent.includes('WTD identity check')`);
    return out;
};
