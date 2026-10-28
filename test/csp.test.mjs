import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyCsp} from '../src/csp.mjs';
test('CSP autoriza solo hashes exactos de scripts inline y recursos previstos',()=>{
 const script='window.theme=1';const page=applyCsp(`<head><meta charset="utf-8"><script>${script}</script><script src="js/bundle.js"></script></head>`);
 const hash=createHash('sha256').update(script).digest('base64');
 assert.ok(page.includes(`script-src 'self' 'sha256-${hash}'`));
 assert.ok(page.includes("connect-src 'self'"));
 assert.ok(page.includes("style-src 'self' 'unsafe-inline'"));
 assert.ok(page.indexOf('Content-Security-Policy')<page.indexOf('<script>'));
 assert.doesNotMatch(page,/script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
 assert.equal(applyCsp(page),page);
});
