import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.mp3':'audio/mpeg'};
// Solo para pruebas locales/CI: sirve un artefacto, nunca el repositorio o notas.
export async function serveBuild({directory='dist',basePath='/',port=0}={}) {
    let root=resolve(directory);
    const server=createServer(async(req,res)=>{
        try {
            const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
            if(!pathname.startsWith(basePath)) {res.writeHead(404).end();return;}
            const relative=pathname.slice(basePath.length);
            const file=resolve(root,relative||'index.html');
            if(file!==root&&!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
            const bytes=await readFile(file);
            res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'}).end(bytes);
        } catch {res.writeHead(404).end();}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    return {url:`http://127.0.0.1:${server.address().port}${basePath.replace(/\/$/,'')}`,
        setDirectory:directory=>{root=resolve(directory);},
        close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
