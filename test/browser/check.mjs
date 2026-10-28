import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {serveBuild} from './serve-build.mjs';
const args=process.argv.slice(2);
const subpath=args.includes('--subpath');
const server=await serveBuild({basePath:subpath?'/write-this-down/':'/'});
try {
    if(!(await fetch(server.url+'/')).ok) throw new Error('El build no responde HTTP200');
    const child=spawn(process.execPath,[fileURLToPath(new URL('./run.mjs',import.meta.url)),...args.filter(a=>a!=='--subpath')],{stdio:'inherit',env:{...process.env,WTD_URL:server.url}});
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
    process.exitCode=code;
} finally {await server.close();}
