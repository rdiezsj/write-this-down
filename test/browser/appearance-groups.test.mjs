export const expect = { groups: 'language,size,theme,mode,font,cursor,sound,background', filtered: 'theme', spanish: 'idioma,tamaño,tema,modo,fuente,cursor,sonido,fondo', selected: true, labels: true, cursorCurrent: true, cursorChanged: true, cursorKept: true };

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
    out.labels = await t.ev(`document.querySelector('.picker-list').textContent.includes('sin sonido') && document.querySelector('.picker-list').textContent.includes('degradados de fondo; animados en notas vacías')`);
    out.cursorCurrent = await t.ev(`document.querySelectorAll('.picker-item.current .label').length > 0 && [...document.querySelectorAll('.picker-item.current .label')].some(e => e.textContent === 'cursor bloque')`);
    await t.filter('cursor fino'); await t.click('.picker-item');
    await t.click('.palette'); await t.filter('cursor');
    out.cursorChanged = await t.ev(`document.querySelector('.picker-item.current .label').textContent === 'cursor fino'`);
    await t.click('.picker-item.current'); await t.click('.palette'); await t.filter('cursor');
    out.cursorKept = await t.ev(`document.querySelector('.picker-item.current .label').textContent === 'cursor fino'`);
    return out;
};
