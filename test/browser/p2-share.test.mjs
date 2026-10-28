import {deflateSync,strToU8} from 'fflate';
export const expect={refusedCreation:true,textIntact:true,rejectedExpansion:true,ownNotesIntact:true};
export default async t=>{
    await t.open();
    await t.ev(`document.querySelector('article').textContent='x'.repeat(1024*1024+100);document.querySelector('article').dispatchEvent(new Event('input',{bubbles:true}))`);
    await t.click('.share');
    const out={refusedCreation:(await t.status()).includes('too large'),textIntact:await t.ev(`document.querySelector('article').textContent.length===1024*1024+100`)};
    await t.sleep(500);
    const before=await t.ev(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('wtd.doc.')).map(k=>[k,localStorage[k]])))`);
    const fragment='s=1.'+Buffer.from(deflateSync(strToU8(JSON.stringify({text:'x'.repeat(2*1024*1024)})))).toString('base64url');
    await t.goto('/#'+fragment);
    out.rejectedExpansion=await t.ev(`document.body.classList.contains('shared')&&document.querySelector('article').textContent.length<1000`);
    out.ownNotesIntact=before===await t.ev(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('wtd.doc.')).map(k=>[k,localStorage[k]])))`);
    return out;
};
