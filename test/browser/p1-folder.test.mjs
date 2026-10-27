export const expect = { foreignIntact:true, separateNote:true, updatedOwn:true, externalIntact:true, conflictCopy:true, conflictNotice:true, spanishNotice:true, reconnect:true };
export default async t => {
    await t.open();
    await t.ev(`(async()=>{window.__root=await navigator.storage.getDirectory();window.showDirectoryPicker=async()=>window.__root;window.__dir=await window.__root.getDirectoryHandle('documents',{create:true});window.__write=async(d,n,s)=>{const f=await d.getFileHandle(n,{create:true});const w=await f.createWritable();await w.write(s);await w.close()};window.__read=async(d,n)=>(await (await d.getFileHandle(n)).getFile()).text();await window.__write(window.__dir,'Same.md','FOREIGN SAME');await window.__write(window.__dir,'foreign.md','FOREIGN');await window.__write(window.__root,'wtd-backup.json','FOREIGN BACKUP');document.querySelector('article').innerHTML='<div>Same</div>';document.querySelector('article').dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await t.sleep(400);await t.click('.backup');await t.click('.backup-modal [data-choice="choose"]');await t.sleep(500);
    const out={foreignIntact:await t.ev(`(async()=>(await window.__read(window.__dir,'Same.md')==='FOREIGN SAME'&&await window.__read(window.__dir,'foreign.md')==='FOREIGN'&&await window.__read(window.__root,'wtd-backup.json')==='FOREIGN BACKUP'))()`),
        separateNote:await t.ev(`(async()=>((await window.__read(window.__dir,'Same (2).md')).trim()==='Same'))()`)};
    await t.ev(`document.querySelector('article').innerHTML='<div>Same</div><div>UPDATED</div>';document.querySelector('article').dispatchEvent(new Event('input',{bubbles:true}))`);await t.sleep(2800);
    out.updatedOwn=await t.ev(`(async()=>((await window.__read(window.__dir,'Same (2).md')).includes('UPDATED')))()`);
    await t.ev(`(async()=>{await window.__write(window.__dir,'Same (2).md','EXTERNAL EDIT');document.querySelector('article').innerHTML='<div>Same</div><div>LOCAL EDIT</div>';document.querySelector('article').dispatchEvent(new Event('input',{bubbles:true}))})()`);await t.sleep(2800);
    out.externalIntact=await t.ev(`(async()=>(await window.__read(window.__dir,'Same (2).md')==='EXTERNAL EDIT'))()`);
    out.conflictCopy=await t.ev(`(async()=>((await window.__read(window.__dir,'Same (3).md')).includes('LOCAL EDIT')))()`);
    await t.click('.backup');out.conflictNotice=await t.ev(`document.querySelector('.backup-state').textContent.includes('separate copies')&&document.querySelector('.backup').classList.contains('attention')`);
    await t.click('.language');await t.click('.backup');
    out.spanishNotice=await t.ev(`document.querySelector('.backup-state').textContent.includes('copias separadas')&&[...document.querySelectorAll('.for-folder')].some(n=>n.textContent.includes('Los archivos existentes'))`);
    await t.reload();await t.sleep(300);
    out.reconnect=await t.ev(`(async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('documents');return await (await (await dir.getFileHandle('Same (2).md')).getFile()).text()==='EXTERNAL EDIT'&&(await (await (await dir.getFileHandle('Same (3).md')).getFile()).text()).includes('LOCAL EDIT')})()`);
    return out;
};
