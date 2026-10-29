export const expect={silent:true,noRetry:true,helpSpanish:true,notesUntouched:true};
export default async t=>{
    await t.open();
    await t.ev("localStorage.clear();localStorage.language='es'");await t.reload();
    await t.focus();await t.insert('NOTA LOCAL SIN EXTENSION',500);
    await t.sleep(11000);
    const out={silent:!(await t.status()).includes('puente')};
    await t.click('.palette');
    out.noRetry=await t.ev("![...document.querySelectorAll('.picker-item .label')].some(el=>el.textContent.includes('puente local'))");
    out.helpSpanish=await t.ev("document.querySelector('.help-modal').textContent.includes('Estado del puente local; reintentar si no está disponible o está pausado')");
    out.notesUntouched=await t.ev("document.querySelector('article').textContent==='NOTA LOCAL SIN EXTENSION'&&!localStorage.getItem('wtd.bridge.cursor')");
    return out;
};
