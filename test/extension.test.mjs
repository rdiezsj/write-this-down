import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

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
    assert.deepEqual(manifest.content_scripts.map(s=>s.matches),[['https://rdiezsj.github.io/write-this-down/*']]);
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
