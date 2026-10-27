import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function background(reduced = false) {
    const events = {}, centres = [];
    let next;
    const context = {
        clearRect() { centres.length = 0; }, setTransform() {}, fillRect() {},
        createRadialGradient(x, y) { centres.push([x, y]); return { addColorStop() {} }; },
    };
    const body = { prepend() {}, classList: { contains: () => false }, style: {} };
    const sandbox = {
        app: { body, shared: { active: false } }, performance: { now: () => 0 },
        window: { innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1,
            matchMedia: () => ({ matches: reduced, addEventListener() {} }),
            addEventListener: (name, fn) => { events[name] = fn; } },
        document: { hidden: false, addEventListener() {}, createElement: () => ({ setAttribute() {}, getContext: () => context }) },
        requestAnimationFrame: fn => { next = fn; return 1; }, cancelAnimationFrame() {},
    };
    const source = readFileSync(new URL('../src/js/components/ripples.js', import.meta.url), 'utf8')
        .replace("import app from './app';", '').replace('export default', 'globalThis.effect =');
    vm.runInNewContext(source, sandbox);
    sandbox.effect.init(); sandbox.effect.set(true);
    return { events, centres, frame: time => next?.(time) };
}

test('el puntero desplaza suavemente los colores con el mismo tiempo de animación', () => {
    const left = background(), right = background();
    left.events.pointermove?.({ clientX: 100, clientY: 100, pointerType: 'mouse' });
    right.events.pointermove?.({ clientX: 900, clientY: 700, pointerType: 'mouse' });
    left.frame(100); right.frame(100);
    assert.ok(right.centres[0][0] > left.centres[0][0]);
    assert.ok(right.centres[0][1] > left.centres[0][1]);
});

test('reducir movimiento mantiene el fondo quieto al mover el puntero', () => {
    const scene = background(true);
    const before = JSON.stringify(scene.centres);
    scene.events.pointermove?.({ clientX: 900, clientY: 700, pointerType: 'mouse' });
    scene.frame(100);
    assert.equal(JSON.stringify(scene.centres), before);
});
