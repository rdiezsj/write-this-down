import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('Chrome distribuye un panel local con código compartido y sin popup',()=>{
 const root='dist/chrome/',m=JSON.parse(readFileSync(root+'manifest.json','utf8'));
 assert.equal(m.side_panel.default_path,'index.html');assert.deepEqual(m.permissions,['sidePanel']);
 assert.equal(m.action.default_popup,undefined);assert.equal(m.sidebar_action,undefined);
 for(const file of ['index.html','background.js','action.js','content.js','theme.js','js/bundle.js','css/style.css','fonts/IBMPlexMono-Regular.woff2','src/bridge/database.js','LICENSE','ATTRIBUTION.md','CREDITS.md',...Object.values(m.icons)])assert.ok(existsSync(root+file),file);
 for(const file of ['opera','firefox','chrome','popup.html','sw.js','CNAME'])assert.equal(existsSync(root+file),false,file);
 assert.deepEqual(readFileSync(root+'action.js'),readFileSync('extension/shared/action.js'));
 assert.deepEqual(m.content_scripts[0].matches,['https://writethisdown.eu/*']);
});
