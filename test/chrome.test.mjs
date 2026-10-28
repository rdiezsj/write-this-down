import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveChrome,chromeCandidates} from './browser/chrome.mjs';
test('Chrome respeta el override, busca PATH y falla sin sustituir un override inválido',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wtd-chrome-'));
 try {
  const file=join(dir,'google-chrome');writeFileSync(file,'#!/bin/sh\nexit 0\n');chmodSync(file,0o755);
  assert.equal(resolveChrome({platform:'linux',env:{PATH:dir}}),file);
  assert.equal(resolveChrome({platform:'linux',env:{PATH:dir,CHROME:file}}),file);
  assert.throws(()=>resolveChrome({platform:'linux',env:{PATH:dir,CHROME:join(dir,'absent')}}),/CHROME/);
  assert.throws(()=>resolveChrome({platform:'linux',env:{PATH:''}}),/Chrome no encontrado/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('candidatos específicos de macOS y Windows sin ejecutar otra plataforma',()=>{
 assert.ok(chromeCandidates('darwin',{}).includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'));
 assert.ok(chromeCandidates('win32',{PROGRAMFILES:'C:\\Programs'}).some(s=>s.includes('Google')&&s.endsWith('chrome.exe')));
});

test('Chrome acepta los nombres alternativos de Linux',()=>{
 for(const name of ['google-chrome-stable','chromium','chromium-browser']) {
  const dir=mkdtempSync(join(tmpdir(),'wtd-chrome-'));
  try {const file=join(dir,name);writeFileSync(file,'#!/bin/sh\nexit 0\n');chmodSync(file,0o755);assert.equal(resolveChrome({platform:'linux',env:{PATH:dir}}),file);}
  finally {rmSync(dir,{recursive:true,force:true});}
 }
});

test('un fallo de spawn termina y elimina el perfil temporal',{skip:process.platform!=='linux'},async()=>{
 const {spawnSync}=await import('node:child_process');const {readdirSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'wtd-spawn-'));
 try {
  const file=join(dir,'broken-chrome');writeFileSync(file,'#!/no/such/interpreter\n');chmodSync(file,0o755);
  const result=spawnSync(process.execPath,['test/browser/run.mjs','zoom'],{env:{...process.env,CHROME:file,TMPDIR:dir},encoding:'utf8',timeout:5000});
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.match(result.stdout,/Chrome no pudo arrancar/);
  assert.deepEqual(readdirSync(dir),['broken-chrome']);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
