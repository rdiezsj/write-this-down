import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('el paquete Firefox incluye recursos locales, avisos e iconos y no anida otros paquetes',()=>{
 const base='dist/firefox/';
 const manifest=JSON.parse(readFileSync(base+'manifest.json','utf8'));
 for(const path of ['index.html','theme.js','js/bundle.js','css/style.css','fonts/IBMPlexMono-Regular.woff2','LICENSE','ATTRIBUTION.md','CREDITS.md','js/THIRD_PARTY_LICENSES.txt','content.js','src/bridge/database.js',...manifest.background.scripts,...Object.values(manifest.icons),...Object.values(manifest.action.default_icon),...Object.values(manifest.sidebar_action.default_icon)])
  assert.ok(existsSync(base+path),path);
 for(const path of ['opera','firefox','CNAME','sw.js','site.webmanifest','404.html'])
  assert.equal(existsSync(base+path),false,path);
 const html=readFileSync(base+'index.html','utf8');
 for(const [,attrs,content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  assert.match(attrs,/\bsrc=/i);assert.equal(content.trim(),'');assert.doesNotMatch(attrs,/https?:\/\//i);
 }
 assert.doesNotMatch(html,/http-equiv="Content-Security-Policy"/i);
 assert.match(readFileSync(base+'js/bundle.js','utf8'),/moz-extension:/);
 assert.match(readFileSync(base+'src/bridge/transport.js','utf8'),/https:\/\/writethisdown\.eu/);
 assert.deepEqual(manifest.content_scripts[0].matches,['https://writethisdown.eu/*']);
});
