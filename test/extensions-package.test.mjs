import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('las tres extensiones distribuyen exactamente el mismo código e iconos',()=>{
 for(const file of ['background.js','action.js','content.js','sidebar-16.png','sidebar-32.png','js/bundle.js','css/style.css','src/bridge/transport.js']) {
  const opera=readFileSync(`dist/opera/${file}`);
  for(const browser of ['firefox','chrome']) assert.deepEqual(readFileSync(`dist/${browser}/${file}`),opera,`${browser}/${file}`);
 }
 for(const browser of ['opera','firefox','chrome']) {
  const root=`dist/${browser}/`,m=JSON.parse(readFileSync(root+'manifest.json','utf8'));
  for(const path of ['index.html','action.js','theme.js','LICENSE','ATTRIBUTION.md','CREDITS.md',...Object.values(m.icons),...Object.values(m.action.default_icon)])assert.ok(existsSync(root+path),root+path);
  for(const other of ['opera','firefox','chrome'])assert.equal(existsSync(root+other),false);
  assert.match(readFileSync(root+'background.js','utf8'),/import '\.\/action.js'/);
 }
});
test('el popup de Opera deriva del mismo editor y conserva recursos locales',()=>{
 const html=readFileSync('dist/opera/popup.html','utf8');
 assert.equal(html.replace('<link rel="stylesheet" href="popup.css">\n',''),readFileSync('dist/opera/index.html','utf8'));
 assert.match(readFileSync('dist/opera/popup.css','utf8'),/width: 760px/);
 assert.match(readFileSync('dist/opera/popup.css','utf8'),/height: 600px/);
});
