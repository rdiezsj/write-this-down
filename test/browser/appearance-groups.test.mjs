export const expect = { groups: 'language,size,theme,font,cursor,sound,background', filtered: 'theme', spanish: 'idioma,tamaño,tema,fuente,cursor,sonido,fondo', selected: true };

export default async t => {
    await t.open();
    await t.click('.palette');
    const headings = () => t.ev(`[...document.querySelectorAll('.picker-subheading')].map(e => e.textContent).join(',')`);
    const out = { groups: await headings() };
    await t.filter('theme');
    out.filtered = await headings();
    await t.click('.picker-item');
    out.selected = await t.ev(`!document.querySelector('.picker').classList.contains('visible')`);
    await t.click('.language');
    await t.click('.palette');
    out.spanish = await headings();
    return out;
};
