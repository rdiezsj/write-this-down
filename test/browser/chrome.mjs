import {accessSync,constants} from 'node:fs';
import {join,win32} from 'node:path';

export function chromeCandidates(platform,env) {
    const names=['google-chrome','google-chrome-stable','chromium','chromium-browser'];
    if(platform==='darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',...names];
    if(platform==='win32') return [env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean).map(root=>win32.join(root,'Google','Chrome','Application','chrome.exe')).concat('chrome.exe');
    return names;
}

export function resolveChrome({platform=process.platform,env=process.env}={}) {
    const candidates=env.CHROME ? [env.CHROME] : chromeCandidates(platform,env);
    for(const candidate of candidates) {
        const paths=/[/\\]/.test(candidate) ? [candidate] : (env.PATH||'').split(platform==='win32'?';':':').filter(Boolean).map(dir=>(platform==='win32'?win32.join:join)(dir,candidate));
        for(const file of paths) {
            try {accessSync(file,platform==='win32'?constants.F_OK:constants.X_OK);return file;} catch { /* siguiente candidato */ }
        }
    }
    throw new Error(env.CHROME ? `CHROME no es un ejecutable accesible: ${env.CHROME}` : 'Chrome no encontrado; instala Google Chrome/Chromium o define CHROME.');
}
