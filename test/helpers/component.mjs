import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {bridgeRecoveryNotes} from '../../src/bridge/recovery.js';
import {validateOperation} from '../../src/bridge/protocol.js';

// Ejecuta el componente real con DOM/almacenamiento sintéticos y sin notas personales.
export function component(name, dependencies) {
    const source = readFileSync(new URL(`../../src/js/components/${name}.js`, import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export default', 'globalThis.result =');
    const context = { bridgeRecoveryNotes, validateOperation, ...dependencies, console, setTimeout, clearTimeout };
    vm.runInNewContext(source, context, { filename: name });
    return context.result;
}
