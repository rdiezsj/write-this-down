import es from '../translations/es.js';

let language = 'en';
const textNodes = [];
const attributes = [];

export function preferredLanguage() {
    const supported = (navigator.languages || [navigator.language]).find(value => /^(es|en)\b/i.test(value));
    return supported && /^es\b/i.test(supported) ? 'es' : 'en';
}

export function currentLanguage() { return language; }

// Los valores capturados (nombres, archivos y fechas) nunca se traducen.
const messages = [
    [/^pasted ([\d.,]+) words$/, (_, n) => `pegadas ${n} palabras`],
    [/^tidied: (.+) · (.+) undoes$/, (_, details, key) => `limpiado: ${details.split(', ').map(t).join(', ')} · ${key} deshace`],
    [/^(\d+) lines? joined$/, (_, n) => `${n} líneas unidas`],
    [/^(\d+) blank lines? removed$/, (_, n) => `${n} líneas vacías eliminadas`],
    [/^(\d+) bullets? made markdown$/, (_, n) => `${n} viñetas convertidas a Markdown`],

    [/^Delete "(.*)" for good\?$/, (_, name) => `¿Eliminar «${name}» definitivamente?`],
    [/^Empty the trash\? (\d+) documents?, for good\.$/, (_, n) => `¿Vaciar la papelera? ${n} documentos se eliminarán definitivamente.`],
    [/^Copying to the folder "(.*)" as you write\.$/, (_, name) => `Copiando a la carpeta «${name}» mientras escribes.`],
    [/^The folder "(.*)" is set; after a closed tab the browser asks once more\. Choose “Allow on every visit” and it stops asking\.$/, (_, name) => `La carpeta «${name}» está configurada. Tras cerrar la pestaña, el navegador vuelve a pedir permiso. Elige «Permitir en cada visita» para conservarlo.`],
    [/^(.+) characters$/, (_, n) => `${n} caracteres`],
    [/^([^·]+) duplicate$/, (_, keys) => `${keys} duplicar`],
    [/^([^·]+) delete for good$/, (_, keys) => `${keys} eliminar definitivamente`],
    [/^([^·]+) delete$/, (_, keys) => `${keys} eliminar`],

    [/^exported (\d+) documents? to (.+)$/, (_, n, name) => `exportados ${n} documentos a ${name}`],
    [/^exported (.+)$/, (_, name) => `exportado ${name}`],
    [/^imported (\d+) documents?(?:, (\d+) already here)?$/, (_, n, skipped) => `importados ${n} documentos${skipped ? `, ${skipped} ya existentes` : ''}`],
    [/^imported (.+)$/, (_, name) => `importado ${name}`],
    [/^moved "(.*)" to trash · (\d+) days$/, (_, name, days) => `«${name}» a la papelera · ${days} días`],
    [/^restored "(.*)"$/, (_, name) => `«${name}» recuperado`],
    [/^deleted "(.*)"$/, (_, name) => `«${name}» eliminado`],
    [/^today: (.+), started$/, (_, date) => `hoy: ${date}, creado`],
    [/^today: (.+)$/, (_, name) => `hoy: ${name}`],
    [/^(.+) is not a WTD backup$/, (_, name) => `${name} no es una copia de WTD`],
    [/^copying to "(.*)" as you write$/, (_, name) => `copiando a «${name}» mientras escribes`],
    [/^copying to "(.*)" again$/, (_, name) => `copia reanudada en «${name}»`],
    [/^(\d+) documents?, gone after (\d+) days$/, (_, n, days) => `${n} documentos; se eliminan tras ${days} días`],
    [/^deleted (.+)$/, (_, date) => `eliminado el ${date}`],
    [/^This text makes a link of about (.+) characters; some messengers cut links this long\. It still opens in a browser\.$/, (_, n) => `El enlace tiene unos ${n} caracteres; algunas aplicaciones lo recortan. Se puede abrir en un navegador.`],
];

export function t(value) {
    if (language !== 'es' || typeof value !== 'string') return value;
    const key = value.replace(/\s+/g, ' ').trim();
    if (Object.hasOwn(es, key)) return es[key];
    for (const [pattern, render] of messages) {
        const match = pattern.exec(value);
        if (match) return render(...match);
    }
    const command = /^(size|theme|mode|font|cursor|sound|lines|focus|contents|fullscreen|markdown|spellcheck|ripples|background|language|backup) (.+)$/.exec(key);
    if (command) return `${t(command[1])} ${t(command[2])}`;
    const count = /^([\d.,]+) (word|words|chars|chars selected|min read)$/.exec(key);
    if (count) return `${count[1]} ${{ word: 'palabra', words: 'palabras', chars: 'caracteres', 'chars selected': 'caracteres seleccionados', 'min read': 'min de lectura' }[count[2]]}`;
    if (key.includes(' · ')) return key.split(' · ').map(t).join(' · ');
    return value;
}

// Registrar solo la plantilla de interfaz, nunca las notas ni el HTML renderizado.
export function init() {
    const excluded = 'article, .markdown-showcase, .picker-list, .contents-list, .status-title, script, style, svg';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement.closest(excluded) && node.textContent.trim()) {
            textNodes.push([node, node.textContent]);
        }
    }
    document.querySelectorAll('[data-hint], [aria-label], [placeholder], [title]').forEach(element => {
        if (element.closest(excluded)) return;
        for (const name of ['data-hint', 'aria-label', 'placeholder', 'title']) {
            if (element.hasAttribute(name)) attributes.push([element, name, element.getAttribute(name)]);
        }
    });
}

export function setLanguage(value) {
    language = value === 'es' ? 'es' : 'en';
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    for (const [node, original] of textNodes) {
        if (node.isConnected) node.textContent = original.replace(original.trim(), t(original.trim()));
    }
    for (const [element, name, original] of attributes) element.setAttribute(name, t(original));
}
