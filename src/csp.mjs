import {createHash} from 'node:crypto';

// Política del artefacto de distribución; dev conserva la recarga y eval de Webpack.
export function applyCsp(html) {
    if(/http-equiv="Content-Security-Policy"/i.test(html)) return html;
    const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(([,attrs])=>! /\bsrc\s*=/i.test(attrs))
        .map(([, ,code])=>`'sha256-${createHash('sha256').update(code).digest('base64')}'`);
    const policy=["default-src 'self'",`script-src 'self' ${[...new Set(hashes)].join(' ')}`,"style-src 'self' 'unsafe-inline'","img-src 'self' https: data:","font-src 'self'","media-src 'self'","connect-src 'self'","worker-src 'self'","object-src 'none'","base-uri 'none'","form-action 'none'"].join('; ');
    return html.replace(/(<meta\s+charset=[^>]+>)/i,`$1\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
