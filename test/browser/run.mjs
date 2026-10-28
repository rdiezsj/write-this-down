// Browser tests: each *.test.mjs in this folder drives the app in headless Chrome
// over CDP and returns a plain object; the file's `expect` says what it must be.
//
//   npm run test:browser              every suite, against http://localhost:3002
//   npm run test:browser -- slash     only the suites whose name contains "slash"
//   WTD_URL=http://localhost:3002 npm run test:browser -- offline
//
// A suite:  export const expect = { … };  export const options = { width, height, flags, touch };
//           export default async (t) => ({ … });
// `t` is the toolkit below. Values that vary (times, ids) are left out of `expect`
// by the suite, which returns booleans or rounded numbers instead.
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { resolveChrome } from './chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WTD_URL || 'http://localhost:3002';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () => new Promise((resolve) => {
    const server = createServer().listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

// Chrome, a CDP socket, and the helpers every suite uses
async function browser(options = {}) {
    const executable = resolveChrome();
    const port = await freePort();
    const profile = mkdtempSync(join(tmpdir(), 'wtd-test-'));
    // Chrome headless puede anunciar hover:none aun con un viewport de escritorio.
    // Fijar el dispositivo antes de cargar la app; las suites táctiles lo declaran.
    const pointer = options.touch
        ? 'primaryPointerType=2,availablePointerTypes=2,primaryHoverType=0,availableHoverTypes=0'
        : 'primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2';
    const flags = [`--blink-settings=${pointer}`, '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${options.width || 1280},${options.height || 800}`, ...(options.flags || []), 'about:blank'];
    const chrome = spawn(executable, flags, { stdio: 'ignore' });
    let spawnError = null;
    chrome.once('error', error => { spawnError = error; });
    let target = null;

    for (let i = 0; i < 60 && !target; i++) {
        if (spawnError) break;
        await sleep(250);
        try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) { /* not up yet */ }
    }

    if (!target) {
        chrome.kill('SIGKILL');
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        throw new Error(spawnError ? `Chrome no pudo arrancar: ${spawnError.message}` : 'Chrome did not start');
    }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let id = 0;
    const pending = new Map();
    const errors = [];
    const requests = [];
    const listeners = [];

    ws.onmessage = (message) => {
        const msg = JSON.parse(message.data);
        if (msg.id) { pending.get(msg.id)?.(msg.result); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') errors.push((msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || '').slice(0, 200));
        if (msg.method === 'Network.requestWillBeSent') requests.push({ url: msg.params.request.url, method: msg.params.request.method, body: msg.params.request.postData, id: msg.params.requestId });
        listeners.forEach(fn => fn(msg));
    };

    const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    const VK = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, F2: 113 };

    const t = {
        send, ev, sleep, errors, requests, listeners, base: BASE,
        // the page, fresh: no storage, reloaded
        async open(path = '/', wait = 1500) {
            await send('Page.navigate', { url: BASE + path }); await sleep(wait);
            await ev("localStorage.clear(); localStorage['language'] = 'en'"); await send('Page.reload'); await sleep(wait);
        },
        async goto(path = '/', wait = 1500) { await send('Page.navigate', { url: BASE + path }); await sleep(wait); },
        async reload(wait = 1500) { await send('Page.reload'); await sleep(wait); },
        // a key by name; mods: Alt 1, Ctrl 2, Meta 4, Shift 8 (CDP's); text for keys that type
        async key(key, code, mods = 0, extra = {}) {
            const vk = VK[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
            await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), windowsVirtualKeyCode: vk, modifiers: mods, ...extra });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || (key.length === 1 ? `Key${key.toUpperCase()}` : key), modifiers: mods });
            await sleep(80);
        },
        // typed one character at a time, as a person types (fires the slash list etc.)
        async type(text) {
            for (const ch of text) {
                const code = ch === ' ' ? 'Space' : ch === '/' ? 'Slash' : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : /[0-9]/.test(ch) ? `Digit${ch}` : 'Unidentified';
                await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch });
                await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code });
            }
            await sleep(120);
        },
        // inserted at once (the browser's own paste-like path)
        async insert(text, wait = 300) { await send('Input.insertText', { text }); await sleep(wait); },
        async focus() { await ev(`document.querySelector('article').focus()`); },
        async click(selector, wait = 200) { await ev(`document.querySelector(${JSON.stringify(selector)}).click()`); await sleep(wait); },
        async mouse(x, y, what = 'click') {
            if (what === 'move') { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
            else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
            await sleep(200);
        },
        async rect(selector) { return JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect())`)); },
        // the text, one string per line, non-breaking spaces as spaces
        lines: () => ev(`[...document.querySelector('article').childNodes].map(n => n.textContent.replace(/\\u00a0/g, ' '))`),
        text: () => ev(`document.querySelector('article').textContent.replace(/\\u00a0/g, ' ')`),
        // the caret into the line that holds `word`, at `offset`
        caretTo: (word, offset = 0) => ev(`(() => { const b = [...document.querySelector('article').childNodes].find(d => d.textContent.includes(${JSON.stringify(word)})); const n = b.nodeType === 3 ? b : b.firstChild; const s = window.getSelection(); const r = document.createRange(); r.setStart(n, Math.min(${offset}, n.length || 0)); r.collapse(true); s.removeAllRanges(); s.addRange(r); return n.textContent })()`),
        pickerRows: () => ev(`[...document.querySelectorAll('.picker-item')].map(e => e.querySelector('.label').textContent + (e.querySelector('.hint') ? ' [' + e.querySelector('.hint').textContent + ']' : '')).join(' | ')`),
        pickerOpen: () => ev(`document.querySelector('.picker').classList.contains('visible') + ':' + (document.querySelector('.picker').dataset.kind || '')`),
        filter: async (query) => { await ev(`{ const i = document.querySelector('.picker input'); i.value = ${JSON.stringify(query)}; i.dispatchEvent(new Event('input')) }`); await sleep(100); },
        status: () => ev(`document.querySelector('.status-message').textContent`),
        stored: (key) => ev(`localStorage[${JSON.stringify(key)}]`),
        async shot(name) {
            const { data } = await send('Page.captureScreenshot', { format: 'png' });
            const file = join(here, 'shots', `${name}.png`);
            writeFileSync(file, Buffer.from(data, 'base64'));
            return file;
        },
        media: (features) => send('Emulation.setEmulatedMedia', { features }),
        async close() { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await gone; rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); },   // Chrome may still be writing its profile as it dies
    };

    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    if (options.touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    // Protección frente a versiones antiguas: sus peticiones de telemetría
    // nunca deben salir del navegador de pruebas. Ejecutar solo contra el servidor local.
    await send('Network.setBlockedURLs', { urls: ['*/stats/*'] });

    return t;
}

// Deep equality on plain data; a mismatch names the path
function diff(expected, actual, path = '') {
    if (expected !== null && typeof expected === 'object') {
        if (actual === null || typeof actual !== 'object') return [`${path}: expected object, got ${JSON.stringify(actual)}`];
        return Object.keys(expected).flatMap(key => diff(expected[key], actual[key], path ? `${path}.${key}` : key));
    }

    return Object.is(expected, actual) ? [] : [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}

async function main() {
    const only = process.argv.slice(2);
    const files = readdirSync(here).filter(f => f.endsWith('.test.mjs') && (!only.length || only.some(name => f.includes(name)))).sort();

    if (!files.length) throw new Error('Ninguna suite coincide con los filtros');
    try { execSync(`mkdir -p ${join(here, 'shots')}`); } catch (e) { /* exists */ }

    let failed = 0;

    for (const file of files) {
        const suite = await import(pathToFileURL(join(here, file)).href);
        const name = file.replace('.test.mjs', '');
        const started = Date.now();
        let t = null;

        try {
            t = await browser(suite.options);
            const result = await Promise.race([
                suite.default(t),
                sleep(suite.options?.timeout || 120000).then(() => { throw new Error('timeout'); }),
            ]);
            const problems = suite.expect ? diff(suite.expect, result) : [];
            const pageErrors = suite.options?.allowErrors ? [] : t.errors;

            if (problems.length || pageErrors.length) {
                failed++;
                console.log(`FAIL ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
                problems.forEach(p => console.log(`  ${p}`));
                pageErrors.forEach(e => console.log(`  page error: ${e}`));
                if (!suite.expect) console.log(`  ${JSON.stringify(result)}`);
            } else {
                console.log(`ok   ${name} (${Math.round((Date.now() - started) / 1000)}s)${suite.expect ? '' : '  ' + JSON.stringify(result).slice(0, 160)}`);
            }
        } catch (error) {
            failed++;
            console.log(`FAIL ${name}: ${error.message}`);
        } finally {
            if (t) await t.close();
        }
    }

    console.log(`${files.length - failed} of ${files.length} suites pass`);
    process.exit(failed ? 1 : 0);
}

main();
