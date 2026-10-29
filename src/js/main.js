import editor from  './components/editor';
import ui from './components/ui';
import bridge from './components/bridge';

editor.init();

// The text must remain available even if the interface cannot start.
try {
    ui.init();
} catch (error) {
    console.error('WTD: could not start the interface', error);
    document.body.style.display = 'block';
    document.querySelector('.status-message').textContent = 'something went wrong while starting · the text is safe; reload, or use "export everything"';
}

try { bridge.start(); } catch (error) { console.error('WTD: local bridge unavailable', error); }

// Ask the browser to keep this site's storage out of eviction (Chrome, Firefox)
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
}

// Work offline: cache the app shell (see public/sw.js)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}
