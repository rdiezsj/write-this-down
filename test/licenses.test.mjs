// Las licencias deben acompañar al JavaScript que se entrega al navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const built = existsSync(new URL('dist/index.html', root));

test('el build distribuye avisos completos de bibliotecas directas y transitivas', { skip: !built }, () => {
    const file = new URL('dist/js/THIRD_PARTY_LICENSES.txt', root);
    assert.ok(existsSync(file), 'Faltan las licencias junto al bundle publicado');
    const notices = readFileSync(file, 'utf8');
    for (const name of ['markdown-it', 'markdown-it-footnote', 'markdown-it-task-lists', 'highlight.js', 'fflate', 'entities', 'linkify-it', 'uc.micro', 'mdurl', 'punycode.js']) {
        const dir = new URL(`node_modules/${name}/`, root);
        const pkg = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));
        assert.ok(notices.includes(`${name}@${pkg.version}`), `Falta identificar ${name}`);
        const license = readdirSync(dir).find(name => /^licen[cs]e(?:[._-].*)?$/i.test(name));
        assert.ok(license, `Falta la licencia instalada de ${name}`);
        assert.ok(notices.includes(readFileSync(new URL(license, dir), 'utf8')), `Licencia alterada o incompleta: ${name}`);
    }
    assert.ok(!notices.includes('argparse@'), 'No incluir paquetes de CLI que no llegan al bundle');
    assert.ok(!notices.includes(root.pathname), 'No publicar rutas de la máquina');
});

test('la aplicación permite abrir las licencias distribuidas', () => {
    const html = readFileSync(new URL('public/index.html', root), 'utf8');
    assert.ok(html.includes('href="./js/THIRD_PARTY_LICENSES.txt"'), 'Falta el enlace a las licencias en la aplicación');
});

test('la compilación falla si una biblioteca incorporada no tiene avisos', async t => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { default: webpack } = await import('webpack');
    const { default: ThirdPartyLicensesPlugin } = await import('../scripts/third-party-licenses.mjs');
    const fixture = mkdtempSync(path.join(tmpdir(), 'wtd-licencias-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const pkg = path.join(fixture, 'node_modules', 'sin-avisos');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'sin-avisos', version: '1.0.0', main: 'index.js', license: 'MIT' }));
    writeFileSync(path.join(pkg, 'index.js'), 'module.exports = 42;');
    writeFileSync(path.join(fixture, 'index.js'), 'console.log(require("sin-avisos"));');
    const compiler = webpack({
        mode: 'production', entry: path.join(fixture, 'index.js'),
        output: { path: path.join(fixture, 'dist') },
        plugins: [new ThirdPartyLicensesPlugin()],
    });
    const { error, stats } = await new Promise(resolve => {
        compiler.run((error, stats) => compiler.close(() => resolve({ error, stats })));
    });
    const message = error ? String(error) : stats.toString({ all: false, errors: true });
    assert.ok(error || stats.hasErrors(), 'La compilación permitió una biblioteca sin avisos');
    assert.match(message, /Faltan avisos de licencia para sin-avisos@1\.0\.0/);
});
