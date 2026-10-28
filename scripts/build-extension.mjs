import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const dist='dist', target=join(dist,'opera');
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
const excluded=new Set(['opera','sw.js','site.webmanifest','robots.txt','sitemap.xml','llms.txt','llms-full.txt']);
for(const name of await readdir(dist)) {
    if(!excluded.has(name)) await cp(join(dist,name),join(target,name),{recursive:true});
}
const index=join(target,'index.html');
let html=await readFile(index,'utf8');
html=html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/i,'');
html=html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/i,'');
const theme=html.match(/<script>([\s\S]*?)<\/script>/i);
if(!theme) throw new Error('No se encuentra el script inicial de tema');
await writeFile(join(target,'theme.js'),theme[1]+'\n');
html=html.replace(theme[0],'<script src="theme.js"></script>');
html=html.replace(/\s*<link rel="manifest"[^>]*>/i,'');
await writeFile(index,html);
await cp('extension/opera/manifest.json',join(target,'manifest.json'));

await cp('extension/opera/background.js',join(target,'background.js'));
await cp('extension/opera/content.js',join(target,'content.js'));
await cp('src/bridge',join(target,'src/bridge'),{recursive:true});
await mkdir(join(target,'src/js'),{recursive:true});
await cp('src/js/keys.js',join(target,'src/js/keys.js'));
