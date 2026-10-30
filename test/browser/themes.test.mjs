export const expect = { initial: true, modes: true, selected: true, persisted: true, system: true, backgrounds: true, animationStops: true, palettes: true, disabled: true };

export default async t => {
    await t.open();
    const out = { initial: await t.ev(`document.body.classList.contains('theme-github') && !!document.querySelector('.mode-flip')`) };
    await t.click('.palette');
    out.modes = await t.ev(`['mode system','mode light','mode dark','theme github','theme nord','theme dracula','theme paper','theme everforest'].every(s => [...document.querySelectorAll('.picker-item .label')].some(e => e.textContent === s))`);
    await t.filter('theme nord'); await t.click('.picker-item');
    await t.click('.palette'); await t.filter('mode dark'); await t.click('.picker-item');
    out.selected = await t.ev(`document.body.classList.contains('theme-nord') && document.body.classList.contains('mode-dark')`);
    await t.reload();
    out.persisted = await t.ev(`document.body.classList.contains('theme-nord') && document.body.classList.contains('mode-dark') && localStorage['color-mode'] === 'dark'`);
    await t.click('.palette'); await t.filter('mode system'); await t.click('.picker-item');
    await t.media([{name:'prefers-color-scheme',value:'light'}]); await t.sleep(150);
    out.system = await t.ev(`document.body.classList.contains('theme-nord') && document.body.classList.contains('mode-light')`);
    await t.focus(); await t.insert('hello'); await t.sleep(300);
    out.backgrounds = await t.ev(`getComputedStyle(document.body).backgroundImage.includes('gradient')`);
    out.animationStops = await t.ev(`(() => { const c = document.querySelector('canvas.ripples'); return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i) => i % 4 === 3 && v); })()`);
    out.palettes = await t.ev(`(() => {
        const body = document.body, old = body.className;
        const luminance = value => {
            const rgb = value.match(/[\\d.]+/g).slice(0, 3).map(n => Number(n) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const color = value => { const e = document.createElement('span'); e.style.color = value; body.append(e); const c = getComputedStyle(e).color; e.remove(); return c; };
        let good = true;
        for (const theme of ['github','nord','dracula','paper','everforest']) for (const mode of ['light','dark']) {
            body.className = old.replace(/theme-\\S+|mode-(light|dark)/g, '') + ' theme-' + theme + ' mode-' + mode;
            const s = getComputedStyle(body);
            const backgrounds = ['--bg','--glow1','--glow2'].map(v => luminance(color(s.getPropertyValue(v))));
            const foregrounds = ['--fg','--muted','--accent'].map(v => luminance(color(s.getPropertyValue(v))));
            good &&= s.backgroundImage.includes('gradient') && backgrounds.every(bg => foregrounds.every(fg => (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05) >= 4.5));
        }
        body.className = old;
        return good;
    })()`);
    await t.click('.palette'); await t.filter('disable background'); await t.click('.picker-item');
    out.disabled = await t.ev(`getComputedStyle(document.body).backgroundImage === 'none' && localStorage.ripples === 'false'`);
    return out;
};
