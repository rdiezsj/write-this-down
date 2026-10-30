import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';

const json=path=>JSON.parse(readFileSync(path,'utf8'));

test('el paquete de Opera contiene panel, iconos y recursos locales',()=>{
    const pkg=json('package.json');
    assert.ok(pkg.scripts['build:extension'],'falta el comando de construcción de la extensión');
    const manifest=json('dist/opera/manifest.json');
    assert.equal(manifest.manifest_version,3);
    assert.equal(manifest.sidebar_action.default_panel,'index.html');
    for(const path of ['index.html','js/bundle.js','css/style.css','fonts/IBMPlexMono-Regular.woff2','js/THIRD_PARTY_LICENSES.txt','LICENSE','ATTRIBUTION.md','CREDITS.md'])
        assert.ok(existsSync('dist/opera/'+path),path);
    for(const icon of Object.values(manifest.sidebar_action.default_icon))assert.ok(existsSync('dist/opera/'+icon),icon);
    assert.deepEqual(manifest.permissions||[],[]);
    assert.equal(manifest.host_permissions,undefined);
    assert.deepEqual(manifest.content_scripts.map(s=>s.matches),[['https://writethisdown.eu/*']]);
    assert.equal(manifest.content_scripts[0].run_at,'document_start');
    assert.equal(manifest.version,pkg.version);
    assert.equal(existsSync('dist/opera/CNAME'),false);
    assert.equal(manifest.background.type,'module');
    assert.ok(existsSync('dist/opera/background.js'));
    assert.ok(existsSync('dist/opera/content.js'));
    assert.ok(existsSync('dist/opera/src/bridge/database.js'));
    const html=readFileSync('dist/opera/index.html','utf8');
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length>0);
    for(const [,attrs,content] of scripts){assert.match(attrs,/\bsrc=/i);assert.equal(content.trim(),'');assert.doesNotMatch(attrs,/https?:\/\//i);}
    assert.doesNotMatch(html,/http-equiv="Content-Security-Policy"/i);
});


test('el paquete de Opera conserva el código propio legible y omite recursos web ajenos al panel',()=>{
    const bundle=readFileSync('dist/opera/js/bundle.js','utf8');
    assert.match(bundle,/function normaliseSeed\(seed\)/);
    assert.ok(bundle.split('\n').length>1000,'el código debe ser revisable');
    for(const path of ['404.html','favicon.ico','android-chrome-256x256.png','android-chrome-512x512.png','src/bridge/session.js','src/bridge/client.js','src/bridge/bootstrap.js','src/bridge/page-transport.js','src/bridge/recovery.js'])
        assert.equal(existsSync('dist/opera/'+path),false,path);
});


test('el script de contenido se limita al dominio productivo',()=>{
    const source=readFileSync('extension/shared/content.js','utf8');
    for(const [url,allowed] of [
        ['https://writethisdown.eu/',true],
        ['https://other.example/',false],
        ['http://writethisdown.eu/',false],
        ['https://writethisdown.eu:8443/',false],
        ['https://writethisdown.eu.ejemplo.com/',false],
        ['https://www.writethisdown.eu/',false],
    ]) {
        for(const subframe of [false,true]) {
            let listeners=0;
            const window={addEventListener(){listeners++;}};
            window.top=subframe?{}:window;
            vm.runInNewContext(source,{window,location:new URL(url)});
            assert.equal(listeners,allowed&&!subframe?1:0,`${url} subframe=${subframe}`);
        }
    }
});
