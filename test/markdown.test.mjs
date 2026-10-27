import test from 'node:test';
import assert from 'node:assert/strict';

// The frontmatter split is a pure function of the text; markdown-it needs no DOM
globalThis.window = globalThis;
const markdown = (await import('../src/js/components/markdown.js')).default;

test('frontmatter at the top becomes a key–value block', () => {
    const html = markdown.render('---\ntitle: Notes\ntags: a, b\n---\n# Hi\n');

    assert.match(html, /^<dl class="frontmatter"><div><dt>title<\/dt><dd>Notes<\/dd><\/div><div><dt>tags<\/dt><dd>a, b<\/dd><\/div><\/dl><h1>Hi<\/h1>/);
});

test('no frontmatter: a rule is still a rule', () => {
    assert.match(markdown.render('text\n\n---\n\nmore'), /<hr>/);
    assert.doesNotMatch(markdown.render('text\n\n---\n\nmore'), /frontmatter/);
});

test('frontmatter escapes html', () => {
    assert.match(markdown.render('---\nx: <b>\n---\n'), /&lt;b&gt;/);
});

test('a picture by address: lazy, no referrer, caption as alt', () => {
    assert.match(markdown.render('![a cat](https://x.test/cat.png)'), /<img src="https:\/\/x.test\/cat.png" alt="a cat" loading="lazy" referrerpolicy="no-referrer">/);
});

test('referencias multilínea sin cerrar no bloquean el renderizado (GHSA-gfr2-rv44-r23c)', async () => {
    const { spawnSync } = await import('node:child_process');
    const module = new URL('../src/js/components/markdown.js', import.meta.url).href;
    // Proceso aislado y cota amplia: una regresión se termina, sin bloquear el navegador.
    const script = `globalThis.window=globalThis;const {default:md}=await import(${JSON.stringify(module)});md.render('[a]: /u "'+'x\\n'.repeat(200000));md.render('['+'a\\n'.repeat(20000));`;
    const result = spawnSync(process.execPath, ['--input-type=module','-e',script], { timeout:5000, encoding:'utf8' });
    assert.equal(result.error, undefined, `El proceso de renderizado excedió el límite: ${result.error}`);
    assert.equal(result.status, 0, result.stderr);
});
