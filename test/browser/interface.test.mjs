import { deflateSync, strToU8 } from 'fflate';
// El idioma cambia en vivo sin traducir notas; el fondo usa color y respeta movimiento reducido.
export const expect = {
    autoSpanish: 'es', title: 'Write this down!', heading: 'Write this down!', idle: '0.24',
    gradient: true, reducedStill: true, spanish: 'es', newLabel: 'nueva', menuLabel: 'menú',
    savedLanguage: 'es', spanishMenu: true, shareMenu: true, darkChosen: true, noteIntact: true,
    hiddenWithText: true, documentTitleIntact: true, english: 'en', englishLabel: 'new',
    englishSelector: 'english', reloadLanguage: 'en', backupLanguage: 'en', backgroundOff: true, sharedLanguageStored: true,
};

export default async t => {
    await t.open();
    await t.send('Network.setUserAgentOverride', {userAgent: await t.ev('navigator.userAgent'), acceptLanguage:'es-ES,es'});
    await t.ev(`delete localStorage['language']`);
    await t.reload();
    const autoSpanish = await t.ev('document.documentElement.lang');
    await t.ev(`localStorage['language']='en'`);
    await t.reload();
    const out = {
        autoSpanish,
        title: await t.ev('document.title'),
        heading: await t.ev(`document.querySelector('#wordmark text').textContent`),
        idle: await t.ev(`getComputedStyle(document.documentElement).getPropertyValue('--ui-idle').trim()`),
    };
    const pixels = `(()=>{const c=document.querySelector('canvas.ripples');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.reduce((sum,v,i)=>sum+(i%4===3?v:0),0)})()`;
    out.gradient = (await t.ev(pixels)) > 0;
    // La respuesta CDP puede adelantarse al evento de media y a su repintado.
    await t.ev(`window.__motionReady=new Promise(resolve=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const done=()=>requestAnimationFrame(()=>requestAnimationFrame(resolve));if(query.matches)done();else query.addEventListener('change',done,{once:true})});true`);
    await t.send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await t.ev('window.__motionReady'); const a = await t.ev(pixels); await t.sleep(200);
    out.reducedStill = a === await t.ev(pixels);
    await t.click('.language');
    out.spanish = await t.ev('document.documentElement.lang');
    out.newLabel = await t.ev(`document.querySelector('.new-doc').textContent`);
    out.menuLabel = await t.ev(`document.querySelector('.palette').textContent`);
    out.savedLanguage = await t.ev(`localStorage['language']`);
    await t.click('.palette'); await t.filter('tema oscuro');
    out.spanishMenu = await t.ev(`document.querySelector('.picker-list').textContent.includes('tema oscuro')`);
    await t.click('.picker-item');
    out.darkChosen = await t.ev(`document.body.classList.contains('scheme-dark-and-white')`);
    await t.click('.palette'); await t.filter('compartir');
    out.shareMenu = await t.ev(`document.querySelector('.picker-list').textContent.includes('compartir mediante enlace…')`);
    await t.key('Escape');
    await t.focus(); await t.insert('new document\nmenu new theme dark\n# Heading',700);
    const before = await t.ev(`document.querySelector('article').innerHTML`);
    out.hiddenWithText = (await t.ev(pixels)) === 0;
    await t.click('.documents');
    out.documentTitleIntact = await t.ev(`[...document.querySelectorAll('.picker-list .label')].some(n=>n.textContent==='new document')`);
    await t.key('Escape'); await t.click('.language');
    out.english = await t.ev('document.documentElement.lang');
    out.englishSelector = await t.ev(`document.querySelector('.language span').textContent`);
    out.englishLabel = await t.ev(`document.querySelector('.new-doc').textContent`);
    out.noteIntact = before === await t.ev(`document.querySelector('article').innerHTML`);
    await t.reload();
    out.reloadLanguage = await t.ev('document.documentElement.lang');
    await t.ev(`window.__saved=[];const make=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{window.__saved.push(b);return make(b)};HTMLAnchorElement.prototype.click=function(){}`);
    await t.click('.backup'); await t.click('.backup-modal [data-choice="export"]');
    out.backupLanguage = await t.ev(`window.__saved[0].text().then(s=>JSON.parse(s).settings.language)`);
    await t.click('.new-doc'); await t.click('.palette'); await t.filter('disable background'); await t.click('.picker-item');
    out.backgroundOff = await t.ev(`localStorage['ripples']==='false'`) && (await t.ev(pixels)) === 0;
    await t.click('.palette'); await t.filter('enable background'); await t.click('.picker-item');
    await t.click('.palette'); await t.filter('theme light'); await t.click('.picker-item');
    await t.ev(`document.querySelector('.language').click()`);
    await t.sleep(200); await t.shot('wtd-es-background');
    await t.click('.about'); await t.shot('wtd-es-about');
    const fragment = Buffer.from(deflateSync(strToU8(JSON.stringify({text:'# menu new document'})))).toString('base64url');
    await t.goto('/#s=1.'+fragment);
    const ownIndex = await t.ev(`localStorage['wtd.docs']`);
    await t.click('.language');
    out.sharedLanguageStored = await t.ev(`localStorage['language']==='en' && document.documentElement.lang==='en' && document.body.classList.contains('shared') && document.querySelector('.markdown-showcase h1').textContent==='menu new document'`)
        && ownIndex === await t.ev(`localStorage['wtd.docs']`);
    return out;
};
