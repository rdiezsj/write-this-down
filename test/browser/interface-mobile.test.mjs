export const options = { width: 390, height: 844 };
export const expect = { lang: 'es', titleFits: true, noOverflow: true, selectorFits: true, aboutFits: true, narrowFooter: true, narrowTitle: true, spanish404: true, english404: true };
export default async t => {
    await t.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await t.open();
    await t.ev(`localStorage['language']='es'`); await t.reload();
    await t.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const out = {
        lang: await t.ev('document.documentElement.lang'),
        titleFits: await t.ev(`document.querySelector('.welcome .wordmark').getBoundingClientRect().right <= innerWidth`),
        noOverflow: await t.ev('document.documentElement.scrollWidth <= innerWidth'),
        selectorFits: await t.ev(`(()=>{const r=document.querySelector('.language').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()`),
    };
    await t.shot('wtd-es-mobile');
    await t.click('.palette'); await t.filter('acerca de'); await t.click('.picker-item');
    out.aboutFits = await t.ev(`(()=>{const r=document.querySelector('.description').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()`);
    await t.shot('wtd-es-mobile-about');
    await t.key('Escape');
    await t.send('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
    await t.sleep(150);
    out.narrowFooter = await t.ev(`document.querySelector('.status-left').getBoundingClientRect().right <= document.querySelector('.status-right').getBoundingClientRect().left`);
    out.narrowTitle = await t.ev(`document.querySelector('.welcome .wordmark').getBoundingClientRect().right <= innerWidth`);
    await t.shot('wtd-es-narrow');
    await t.goto('/404.html');
    out.spanish404 = await t.ev(`document.documentElement.lang==='es' && document.querySelector('.missing-message').textContent==='No hay nada en esta dirección.'`);
    await t.ev(`localStorage['language']='en'`); await t.reload();
    out.english404 = await t.ev(`document.documentElement.lang==='en' && document.querySelector('.missing-message').textContent==='There is nothing at this address.'`);
    return out;
};
