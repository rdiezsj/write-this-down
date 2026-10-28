// Comprueba que la PWA conserva los recursos al publicarse bajo una subruta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('el manifiesto instala la aplicación dentro de su propia subruta', () => {
    const manifest = JSON.parse(read('public/site.webmanifest'));
    const base = 'https://example.test/write-this-down/';
    for (const path of [manifest.start_url, manifest.scope, ...manifest.icons.map(icon => icon.src)]) {
        assert.ok(new URL(path, base).href.startsWith(base), path);
    }
});

test('el service worker precarga y protege los recursos de su ámbito', () => {
    const handlers = {};
    const added = [];
    const deleted = [];
    const scope = 'https://example.test/write-this-down/';
    const context = {
        URL,
        self: {
            registration: { scope },
            location: { origin: 'https://example.test' },
            addEventListener: (name, handler) => { handlers[name] = handler; },
            skipWaiting: () => {},
            clients: { claim: () => {} },
        },
        caches: {
            open: async () => ({ addAll: paths => { added.push(...paths); } }),
            keys: async () => ['unrelated-cache', 'wtd-/write-this-down/-old', 'wtd-/another-app/-old'],
            delete: async name => { deleted.push(name); },
        },
    };
    const source = read('public/sw.js').replaceAll('__BUILD__', 'test').replaceAll('__ASSETS__', JSON.stringify(['./', './js/bundle.js']));
    vm.runInNewContext(source, context);
    return (async () => {
        let done;
        handlers.install({ waitUntil: promise => { done = promise; } });
        await done;
        assert.deepEqual(added, [scope, `${scope}js/bundle.js`]);
        handlers.activate({ waitUntil: promise => { done = promise; } });
        await done;
        assert.deepEqual(deleted, ['wtd-/write-this-down/-old']);
    })();
});

test('las hojas, iconos y manifiesto del editor no escapan de la subruta', () => {
    const html = read('public/index.html');
    const paths = [...html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/g)].map(match => match[1]);
    const base = 'https://example.test/write-this-down/';
    for (const path of paths.filter(path => !path.startsWith('https://'))) {
        assert.ok(new URL(path, base).href.startsWith(base), path);
    }
});


test('la copia pública conserva exactamente los recursos binarios',()=>{
    const root=new URL('../',import.meta.url);
    if(!existsSync(new URL('dist/index.html',root)))return;
    const scan=dir=>{
        for(const entry of readdirSync(new URL(`public/${dir}`,root),{withFileTypes:true})) {
            const name=dir+entry.name;
            if(entry.isDirectory())scan(name+'/');
            else if(/\.(?:woff2|png|ico|mp3|ogg|wav)$/.test(name)) {
                assert.ok(readFileSync(new URL(`public/${name}`,root)).equals(readFileSync(new URL(`dist/${name}`,root))),`${name}: bytes modificados en el build`);
            }
        }
    };
    scan('');
});
