import app from './app';

// Degradados propios de WTD: visibles solo con la nota vacía, sin dibujar texto.
export default (function () {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let canvas, context, on = false, request = 0, last = 0;
    let width = 0, height = 0;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const palettes = {
        github: ['85,165,215', '160,130,205', '225,170,125'],
        nord: ['94,129,172', '136,192,208', '129,161,193'],
        dracula: ['189,147,249', '255,121,198', '139,233,253'],
        paper: ['190,125,80', '210,170,110', '160,120,90'],
        everforest: ['131,165,98', '167,192,128', '219,188,127'],
    };

    function init() {
        canvas = document.createElement('canvas');
        canvas.className = 'ripples';
        canvas.setAttribute('aria-hidden', 'true');
        app.body.prepend(canvas);
        context = canvas.getContext('2d');
        window.addEventListener('resize', layout);
        window.addEventListener('pointermove', event => {
            if (!on || still.matches || event.pointerType === 'touch') return;
            pointer.targetX = event.clientX / width - 0.5;
            pointer.targetY = event.clientY / height - 0.5;
        }, { passive: true });
        document.addEventListener('pointerleave', () => {
            pointer.targetX = pointer.targetY = 0;
        });
        document.addEventListener('visibilitychange', refresh);
        still.addEventListener('change', refresh);
        layout();
    }

    function layout() {
        if (!canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        refresh();
    }

    function draw(time) {
        context.clearRect(0, 0, width, height);
        const dark = app.body.classList.contains('mode-dark');
        const theme = Object.keys(palettes).find(name => app.body.classList.contains(`theme-${name}`));
        const colours = palettes[theme] || palettes.github;
        colours.forEach((colour, i) => {
            const phase = time / 18000 + i * 2.1;
            const x = width * (0.5 + Math.sin(phase) * 0.32 + (still.matches ? 0 : pointer.x * 0.45));
            const y = height * (0.5 + Math.cos(phase * 0.8) * 0.3 + (still.matches ? 0 : pointer.y * 0.45));
            const radius = Math.max(width, height) * 0.55;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${colour},${dark ? 0.12 : 0.15})`);
            gradient.addColorStop(0.55, `rgba(${colour},${dark ? 0.05 : 0.06})`);
            gradient.addColorStop(1, `rgba(${colour},0)`);
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
        });
    }

    function frame(time) {
        request = 0;
        if (!on || document.hidden) return;
        if (still.matches) {
            refresh();
            return;
        }
        if (time - last >= 1000 / 20) {
            pointer.x += (pointer.targetX - pointer.x) * 0.12;
            pointer.y += (pointer.targetY - pointer.y) * 0.12;
            draw(time);
            last = time;
        }
        request = requestAnimationFrame(frame);
    }

    function refresh() {
        cancelAnimationFrame(request);
        request = 0;
        if (!context) return;
        context.clearRect(0, 0, width, height);
        if (!on || document.hidden) return;
        draw(still.matches ? 0 : performance.now());
        if (!still.matches) request = requestAnimationFrame(frame);
    }

    function set(empty) {
        on = empty && !!canvas && !app.shared.active && app.body.style.display !== 'none';
        refresh();
    }

    return { init, set };
})();
