import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const browser=process.argv[2] || 'opera';
if(!['opera','firefox','chrome'].includes(browser)) throw new Error('Navegador de extensión desconocido');
const dist='dist', target=join(dist,browser);
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
const excluded=new Set(['opera','firefox','chrome','CNAME','sw.js','site.webmanifest','robots.txt','sitemap.xml','llms.txt','llms-full.txt','404.html','favicon.ico','android-chrome-256x256.png','android-chrome-512x512.png']);
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
await cp(`extension/${browser}/manifest.json`,join(target,'manifest.json'));
if(browser==='opera') {
    await cp('extension/opera/popup.css',join(target,'popup.css'));
    await writeFile(join(target,'popup.html'),html.replace('</head>','<link rel="stylesheet" href="popup.css">\n</head>'));
}
await cp('extension/shared/action.js',join(target,'action.js'));

await cp('extension/shared/background.js',join(target,'background.js'));
await cp('extension/shared/content.js',join(target,'content.js'));
await mkdir(join(target,'src/bridge'),{recursive:true});
for(const name of ['database.js','protocol.js','reconcile.js','transport.js'])
    await cp(join('src/bridge',name),join(target,'src/bridge',name));
await mkdir(join(target,'src/js'),{recursive:true});
await cp('src/js/keys.js',join(target,'src/js/keys.js'));

for(const size of [16,32]) await cp(`extension/shared/sidebar-${size}.png`,join(target,`sidebar-${size}.png`));
