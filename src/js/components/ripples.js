import app from './app';

// Degradados propios de WTD: visibles solo con la nota vacía, sin dibujar texto.
export default (function () {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let canvas, context, on = false, request = 0, last = 0;
    let width = 0, height = 0;

    function init() {
        canvas = document.createElement('canvas');
        canvas.className = 'ripples';
        canvas.setAttribute('aria-hidden', 'true');
        app.body.prepend(canvas);
        context = canvas.getContext('2d');
        window.addEventListener('resize', layout);
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
        const dark = ['scheme-dark-and-white', 'scheme-dark-and-green', 'scheme-night'].some(name => app.body.classList.contains(name));
        const colours = app.body.classList.contains('scheme-dark-and-green')
            ? ['65,160,100', '40,120,120', '90,140,80']
            : ['85,165,215', '160,130,205', '225,170,125'];
        colours.forEach((colour, i) => {
            const phase = time / 18000 + i * 2.1;
            const x = width * (0.5 + Math.sin(phase) * 0.32);
            const y = height * (0.5 + Math.cos(phase * 0.8) * 0.3);
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
        if (time - last >= 1000 / 20) {
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
