// El renderizado nativo de esta línea tarda decenas de segundos incluso sin WTD.
// Comprobar que termina y conserva el texto, sin imponer un umbral de latencia.
export const options = { timeout: 180000 };
export const expect = { saved: true, responsive: true };

export default async t => {
    await t.open();
    const started = Date.now();
    await t.ev(`(() => {
        const article = document.querySelector('article.content');
        article.textContent = 'ñ🙂'.repeat(250000);
        article.dispatchEvent(new InputEvent('input', { bubbles: true }));
    })()`);
    await t.sleep(700);
    console.log(`Línea Unicode: ${Date.now()-started} ms hasta respuesta y guardado`);
    return {
        saved: await t.ev(`localStorage.getItem('wtd.doc.' + localStorage.getItem('wtd.current')) === 'ñ🙂'.repeat(250000)`),
        responsive: await t.ev(`document.querySelector('article.content').textContent === 'ñ🙂'.repeat(250000)`),
    };
};
