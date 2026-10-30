"""Prueba nativa de Firefox con Marionette y un perfil desechable; solo biblioteca estándar."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[2]
package = root / 'dist/firefox'
assert (package / 'manifest.json').exists(), 'Ejecuta npm run build:firefox primero'
scratch = tempfile.mkdtemp(prefix='wtd-firefox-test-')
profile = str(Path(scratch, 'profile'))
Path(profile).mkdir()
# Solo esta copia de pruebas sustituye el origen productivo por el servidor local.
fixture = Path(scratch, 'extension')
shutil.copytree(package, fixture)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root / 'dist')))
origin = f'http://127.0.0.1:{server.server_port}'
threading.Thread(target=server.serve_forever, daemon=True).start()
manifest = json.loads((fixture / 'manifest.json').read_text())
manifest['content_scripts'][0]['matches'] = ['http://127.0.0.1/*']
(fixture / 'manifest.json').write_text(json.dumps(manifest))
for name in ['content.js', 'src/bridge/transport.js']:
    path = fixture / name
    path.write_text(path.read_text().replace("origin==='https://writethisdown.eu'", 'origin===' + json.dumps(origin)))
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
Path(profile, 'user.js').write_text(
    f'user_pref("marionette.port", {port});\n'
    'user_pref("browser.shell.checkDefaultBrowser", false);\n', encoding='utf8')
log = tempfile.TemporaryFile(mode='w+')
process = None
connection = None
try:
    process = subprocess.Popen([
        os.environ.get('FIREFOX', 'firefox'), '--headless', '--no-remote',
        '--profile', profile, '--marionette', '--remote-allow-system-access',
    ], stdout=log, stderr=log)
    for _ in range(100):
        try:
            connection = socket.create_connection(('127.0.0.1', port), timeout=1)
            break
        except OSError:
            if process.poll() is not None:
                break
            time.sleep(.2)
    assert connection is not None, 'Firefox no inicia Marionette'
    connection.settimeout(40)

    def receive():
        size = b''
        while not size.endswith(b':'):
            chunk = connection.recv(1)
            assert chunk, 'Marionette cerró la conexión'
            size += chunk
        data = b''
        while len(data) < int(size[:-1]):
            chunk = connection.recv(int(size[:-1]) - len(data))
            assert chunk, 'Respuesta incompleta de Marionette'
            data += chunk
        return json.loads(data)

    receive()
    serial = 0

    def call(name, arguments=None):
        global serial
        serial += 1
        body = json.dumps([0, serial, name, arguments or {}]).encode()
        connection.sendall(str(len(body)).encode() + b':' + body)
        response = receive()
        assert response[1] == serial, response
        assert response[2] is None, response[2]
        return response[3]

    def script(source):
        return call('WebDriver:ExecuteScript', {'script': source, 'args': []})['value']

    def wait(source):
        for _ in range(80):
            if script(source):
                return
            time.sleep(.25)
        raise AssertionError('No se cumple: ' + source)

    capabilities = call('WebDriver:NewSession')['capabilities']
    call('Addon:Install', {'path': str(fixture), 'temporary': True})
    call('Marionette:SetContext', {'value': 'chrome'})
    extension_url = script("""
        const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
        return ExtensionParent.GlobalManager.getExtension('wtd@writethisdown.eu').baseURI.spec;
    """)
    assert script("return !SidebarController.isOpen;"), 'El panel no debe abrirse al instalar'
    script("""
        const ui=window.CustomizableUI;
        ui.addWidgetToArea('wtd_writethisdown_eu-browser-action',ui.AREA_NAVBAR);
    """)
    button = call('WebDriver:FindElement', {
        'using': 'css selector', 'value': '#wtd_writethisdown_eu-BAP',
    })['value']
    call('WebDriver:PerformActions', {'actions': [{
        'type': 'pointer', 'id': 'mouse', 'parameters': {'pointerType': 'mouse'},
        'actions': [
            {'type': 'pointerMove', 'duration': 0, 'origin': button, 'x': 0, 'y': 0},
            {'type': 'pointerDown', 'button': 0}, {'type': 'pointerUp', 'button': 0},
        ],
    }]})
    wait("return SidebarController.isOpen && SidebarController.currentID==='wtd_writethisdown_eu-sidebar-action';")
    assert script("return !!document.getElementById('menubar_menu_wtd_writethisdown_eu-sidebar-action');")
    # La pestaña interna usa el mismo editor, origen y biblioteca que el panel nativo.
    script('Services.io.offline=true;')
    call('Marionette:SetContext', {'value': 'content'})
    call('WebDriver:Navigate', {'url': extension_url + 'index.html'})
    wait("return document.querySelector('article.content')?.isContentEditable && document.querySelector('.bridge-indicator')?.dataset.state==='connected';")
    script("""
        const editor=document.querySelector('article.content');
        editor.innerHTML='<div>NOTA FIREFOX AISLADA</div>';
        editor.dispatchEvent(new Event('input',{bubbles:true}));
    """)
    wait("return Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA FIREFOX AISLADA')) && !Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'));")
    call('WebDriver:Refresh')
    wait("return document.querySelector('article.content')?.textContent==='NOTA FIREFOX AISLADA' && document.querySelector('.bridge-indicator')?.dataset.state==='connected';")
    script("document.querySelector('.share').click();document.querySelector('.share-modal [data-choice=public]').click();")
    wait("return document.querySelector('.link-output')?.value.startsWith('https://writethisdown.eu/#s=');")
    call('Marionette:SetContext', {'value': 'chrome'})
    script('Services.io.offline=false;')
    call('Marionette:SetContext', {'value': 'content'})
    call('WebDriver:Navigate', {'url': origin + '/'})
    wait("return document.querySelector('.bridge-indicator')?.dataset.state==='connected';")
    wait("return Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA FIREFOX AISLADA'));")
    script("""
        const editor=document.querySelector('article.content');
        editor.innerHTML='<div>NOTA DESDE WEB FIREFOX</div>';
        editor.dispatchEvent(new Event('input',{bubbles:true}));
    """)
    wait("return Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA DESDE WEB FIREFOX')) && !Object.keys(localStorage).some(k=>k.startsWith('wtd.bridge.op.'));")
    call('WebDriver:Navigate', {'url': extension_url + 'index.html'})
    wait("return Object.keys(localStorage).some(k=>k.startsWith('wtd.doc.')&&localStorage[k].includes('NOTA DESDE WEB FIREFOX'));")
    print(json.dumps({
        'firefox': capabilities['browserVersion'], 'instalacion': True,
        'boton_abre_panel': True, 'entrada_lateral': True, 'editor_offline': True,
        'puente_conectado': True, 'puente_web_bidireccional': True, 'nota_tras_recarga': True, 'enlace_publico': True,
        'perfil': 'aislado y eliminado',
    }, ensure_ascii=False))
finally:
    if connection:
        connection.close()
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    log.close()
    server.shutdown()
    server.server_close()
    shutil.rmtree(scratch)
