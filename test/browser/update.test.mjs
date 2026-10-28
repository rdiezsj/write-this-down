import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveBuild} from './serve-build.mjs';
import {openPage} from './page.mjs';
export const expect={controlled:true,oldBuild:true,activated:true,oldDraft:true,newBuild:true,coherent:true,saved:true,otherNote:true,offline:true,scoped:true};
export default async t=>{
    const dir=mkdtempSync(join(tmpdir(),'wtd-updates-'));
    let server,child;
    try {
        const stamp=Date.now().toString(36);
        for(const build of ['A','B']) {
            const root=join(dir,build);cpSync('dist',root,{recursive:true});
            const script=join(root,'js/bundle.js');writeFileSync(script,readFileSync(script,'utf8')+`\nwindow.__fixtureBuild='${build}';`);
            const css=join(root,'css/style.css');writeFileSync(css,readFileSync(css,'utf8')+`\n:root{--fixture-build:${build}}`);
            const sw=join(root,'sw.js');writeFileSync(sw,readFileSync(sw,'utf8').replace(/const VERSION = '[^']+';/,`const VERSION = '${stamp}-${build}';`));
        }
        const path=new URL(t.base).pathname.replace(/\/$/,'')+'/';
        server=await serveBuild({directory:join(dir,'A'),basePath:path});
        await t.send('Page.navigate',{url:server.url+'/'});await t.sleep(1000);
        await t.ev(`localStorage.clear();localStorage.language='en'`);await t.reload(800);
        await t.ev(`navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready)`);
        for(let i=0;i<100&&!await t.ev(`!!navigator.serviceWorker.controller`);i++)await t.sleep(50);
        const out={controlled:await t.ev(`!!navigator.serviceWorker.controller`),oldBuild:await t.ev(`__fixtureBuild==='A'&&getComputedStyle(document.documentElement).getPropertyValue('--fixture-build').trim()==='A'`)};
        await t.focus();await t.insert('saved in build A',500);
        const id=await t.ev(`localStorage['wtd.current']`);
        await t.ev(`window.__denyWrites=true;const original=localStorage;Object.defineProperty(window,'localStorage',{configurable:true,value:new Proxy(original,{get:(s,k)=>typeof s[k]==='function'?s[k].bind(s):s[k],set:(s,k,v)=>{if(window.__denyWrites&&String(k).startsWith('wtd.doc.'))throw new DOMException('full','QuotaExceededError');s[k]=v;return true;}})});window.__oldController=navigator.serviceWorker.controller`);
        await t.insert(' + pending draft',500);
        server.setDirectory(join(dir,'B'));
        await t.ev(`navigator.serviceWorker.getRegistration().then(r=>r.update())`);
        for(let i=0;i<100&&!await t.ev(`navigator.serviceWorker.controller!==__oldController`);i++)await t.sleep(50);
        out.activated=await t.ev(`navigator.serviceWorker.controller!==__oldController`);
        child=await openPage(t,server.url+'/');await t.sleep(1300);
        out.newBuild=await child.ev(`__fixtureBuild==='B'`);
        out.coherent=await child.ev(`getComputedStyle(document.documentElement).getPropertyValue('--fixture-build').trim()==='B'`);
        await child.ev(`document.querySelector('.new-doc').click();const a=document.querySelector('article');a.innerHTML='<div>new note in B</div>';a.dispatchEvent(new Event('input',{bubbles:true}))`);await t.sleep(500);
        out.oldDraft=(await t.text()).includes('pending draft')&&await t.ev(`__fixtureBuild==='A'`);
        await t.ev(`window.__denyWrites=false;window.dispatchEvent(new Event('pagehide'))`);await t.sleep(300);
        out.saved=await t.ev(`localStorage[${JSON.stringify('wtd.doc.'+id)}].includes('pending draft')`);
        out.otherNote=await child.ev(`Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('new note in B'))`);
        out.scoped=await child.ev(`caches.keys().then(keys=>keys.length===1&&keys[0].startsWith('wtd-'+new URL(navigator.serviceWorker.controller.scriptURL).pathname.replace(/sw.js$/,'')+'-'))`);
        await child.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
        await child.send('Page.reload');await t.sleep(1300);
        out.offline=await child.ev(`__fixtureBuild==='B'&&document.querySelector('article').isContentEditable`);
        return out;
    } finally {
        if(child)await child.close();
        if(server)await server.close();
        rmSync(dir,{recursive:true,force:true});
    }
};
