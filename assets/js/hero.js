// WAGMI home hero: the lime pixel-dot wave, and a one-time intro in which dots
// leave the wave and assemble the frog-eye W where the hero logo sits.
// Needs three.js (global THREE) loaded first. Timings shared with CSS live in site.css.
(() => {
    'use strict';

    // ------------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------------
    const CONFIG = {
        wave: {
            columns: 50,
            rows: 50,
            spacing: 2,          // world units between dots
            amplitude: 2,
            dotSize: 0.14,       // world-space size before perspective
            maxDotCss: 4,        // largest dot, in CSS px
            opacity: 0.45,
            nearFade: [10, 24],  // dots fade out between these camera distances
            parallax: 0.001,     // pointer → rotation
            easing: 0.05,
            maxPixelRatio: 2,
        },
        intro: {
            latestStartMs: 1500, // after navigation; later than this, just show the logo
            staggerMs: 350,      // dots set off over this window
            flightMs: [800, 1050],
            liftPx: [40, 120],   // upward arc of each flight
            holdMs: 120,         // pause on the finished W before the handoff
            returnMs: 800,       // borrowed dots fade back into the wave
            storageKey: 'wagmi-intro',
        },
    };

    const root = document.documentElement;
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------
    const cssValue = (name) => getComputedStyle(root).getPropertyValue(name).trim();

    /** Reads a CSS duration custom property ("250ms" or "0.25s") as milliseconds. */
    function cssMs(name) {
        const value = cssValue(name);
        const n = parseFloat(value);
        return value.endsWith('ms') ? n : n * 1000;
    }

    /** "#9BD94A" → [155, 217, 74] */
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }

    const lerp = (a, b, t) => a + (b - a) * t;
    const between = ([min, max]) => lerp(min, max, Math.random());
    const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.wave.maxPixelRatio);

    function shuffle(list) {
        for (let n = list.length - 1; n > 0; n--) {
            const m = Math.floor(Math.random() * (n + 1));
            [list[n], list[m]] = [list[m], list[n]];
        }
        return list;
    }

    // ------------------------------------------------------------------
    // Wave
    // ------------------------------------------------------------------
    const VERTEX_SHADER = `
        attribute float aAlpha;
        uniform float uSize, uScale, uMaxPx;
        uniform vec2 uNearFade;
        varying float vAlpha;
        void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float dist = -mv.z;
            // Perspective size in device px, rounded to whole device px so dots stay crisp.
            gl_PointSize = clamp(floor(uSize * uScale / dist + 0.5), 1.0, uMaxPx);
            vAlpha = aAlpha * smoothstep(uNearFade.x, uNearFade.y, dist);
            gl_Position = projectionMatrix * mv;
        }`;

    const FRAGMENT_SHADER = `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
            if (vAlpha < 0.01) discard;
            gl_FragColor = vec4(uColor, uOpacity * vAlpha);
        }`;

    function createWave(container, color) {
        const cfg = CONFIG.wave;
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        } catch (e) {
            return null; // no WebGL
        }
        const dpr = pixelRatio();
        renderer.setPixelRatio(dpr);
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 15, 30);
        camera.lookAt(0, 0, 0);

        const count = cfg.columns * cfg.rows;
        const positions = new Float32Array(count * 3);
        const alphas = new Float32Array(count).fill(1);
        const offsetX = (cfg.columns * cfg.spacing) / 2;
        const offsetZ = (cfg.rows * cfg.spacing) / 2;
        for (let x = 0, i = 0; x < cfg.columns; x++) {
            for (let z = 0; z < cfg.rows; z++, i += 3) {
                positions[i] = x * cfg.spacing - offsetX;
                positions[i + 2] = z * cfg.spacing - offsetZ;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uOpacity: { value: cfg.opacity },
                uSize: { value: cfg.dotSize },
                uScale: { value: (window.innerHeight * dpr) / 2 },
                uMaxPx: { value: cfg.maxDotCss * dpr },
                uNearFade: { value: new THREE.Vector2(...cfg.nearFade) },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
        });
        const points = new THREE.Points(geometry, material);
        scene.add(points);

        const wave = { camera, points, geometry, returning: null };
        const pointer = { x: 0, y: 0 };
        document.addEventListener('mousemove', (e) => {
            pointer.x = e.clientX - window.innerWidth / 2;
            pointer.y = e.clientY - window.innerHeight / 2;
        });
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            material.uniforms.uScale.value = (window.innerHeight * dpr) / 2;
        });

        const clock = new THREE.Clock();
        (function animate() {
            requestAnimationFrame(animate);
            updateHeights(geometry, clock.getElapsedTime());
            updateReturningDots(wave);
            points.rotation.y += cfg.easing * (pointer.x * cfg.parallax - points.rotation.y);
            points.rotation.x += cfg.easing * (pointer.y * cfg.parallax - points.rotation.x);
            renderer.render(scene, camera);
        })();

        return wave;
    }

    function updateHeights(geometry, t) {
        const { columns, rows, amplitude } = CONFIG.wave;
        const p = geometry.attributes.position.array;
        for (let x = 0, i = 1; x < columns; x++) {
            for (let z = 0; z < rows; z++, i += 3) {
                p[i] = Math.sin(x / 2 + t) * amplitude + Math.cos(z / 2 + t) * amplitude;
            }
        }
        geometry.attributes.position.needsUpdate = true;
    }

    /** Lends dots to the intro (hidden) or fades them back in afterwards. */
    function setDotAlpha(wave, indices, value) {
        const a = wave.geometry.attributes.aAlpha;
        indices.forEach((i) => { a.array[i] = value; });
        a.needsUpdate = true;
    }

    function updateReturningDots(wave) {
        if (!wave.returning) return;
        const { start, indices } = wave.returning;
        const f = Math.max(0, Math.min(1, (performance.now() - start) / CONFIG.intro.returnMs));
        setDotAlpha(wave, indices, f);
        if (f >= 1) wave.returning = null;
    }

    /** Screen positions of the wave dots that are currently visible, in random order. */
    function visibleDots(wave) {
        const { camera, points, geometry } = wave;
        const fullyVisibleFrom = CONFIG.wave.nearFade[1];
        const pos = geometry.attributes.position.array;
        const v = new THREE.Vector3();
        const w = window.innerWidth, h = window.innerHeight;
        const dots = [];
        points.updateMatrixWorld();
        for (let i = 0; i < pos.length / 3; i++) {
            v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(points.matrixWorld);
            if (v.distanceTo(camera.position) < fullyVisibleFrom) continue;
            v.project(camera);
            if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
            dots.push({ index: i, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h });
        }
        return shuffle(dots);
    }

    // ------------------------------------------------------------------
    // The W, read from the inline hero logo (single source of truth)
    // ------------------------------------------------------------------
    /**
     * Each pixel of the W as { x, y, size, rgb } in viewport px.
     * Skips pixels in the background colour (the pupils), which arrive with the logo.
     */
    function wPixels(logo, skipFill) {
        const svgBox = logo.viewBox.baseVal;
        const rect = logo.getBoundingClientRect();
        const unit = rect.width / svgBox.width;
        const group = logo.querySelector('.w-mark').parentNode;           // translate(8 8) scale(2)
        const m = group.transform.baseVal.consolidate().matrix;
        const pixels = [];
        logo.querySelectorAll('.w-mark path').forEach((path) => {
            const fill = path.getAttribute('fill');
            if (fill.toLowerCase() === skipFill.toLowerCase()) return;
            const rgb = hexToRgb(fill);
            // Paths are runs of whole cells: "M<x> <y>h<w>v1h-<w>z"
            for (const [, x, y, run] of path.getAttribute('d').matchAll(/M(\d+) (\d+)h(\d+)/g)) {
                for (let cx = +x; cx < +x + +run; cx++) {
                    pixels.push({
                        x: rect.left + (m.e + cx * m.a) * unit,
                        y: rect.top + (m.f + +y * m.d) * unit,
                        size: m.a * unit,
                        rgb,
                    });
                }
            }
        });
        return pixels;
    }

    // ------------------------------------------------------------------
    // Intro
    // ------------------------------------------------------------------
    function markIntroSeen() {
        try { sessionStorage.setItem(CONFIG.intro.storageKey, '1'); } catch (e) { /* private mode */ }
    }

    function revealLogo() {
        root.classList.remove('intro', 'intro-playing');
        markIntroSeen();
    }

    /** One particle per W pixel, each borrowing a visible wave dot as its start. */
    function planFlights(targets, sources) {
        const cfg = CONFIG.intro;
        const h = window.innerHeight, w = window.innerWidth;
        return targets.map((target, n) => {
            const source = sources[n] || { index: null, x: Math.random() * w, y: h + 8 };
            return {
                ...target,
                from: source,
                delay: Math.random() * cfg.staggerMs,
                duration: between(cfg.flightMs),
                lift: between(cfg.liftPx),
            };
        });
    }

    function createOverlay() {
        const dpr = pixelRatio();
        const canvas = document.createElement('canvas');
        canvas.className = 'intro-canvas';
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        document.body.appendChild(canvas);
        return { canvas, ctx: canvas.getContext('2d'), dpr };
    }

    /** Draws one particle: from a small lime dot to a full W pixel in its own colour. */
    function drawFlight(ctx, dpr, flight, elapsed, dotRgb, dotOpacity) {
        const progress = Math.min(1, Math.max(0, (elapsed - flight.delay) / flight.duration));
        const e = easeInOutCubic(progress);
        const size = lerp(2, flight.size, e);
        const x = lerp(flight.from.x - 1, flight.x, e);
        const y = lerp(flight.from.y - 1, flight.y, e) - Math.sin(Math.PI * e) * flight.lift;
        const [r, g, b] = dotRgb.map((c, i) => Math.round(lerp(c, flight.rgb[i], e)));
        ctx.fillStyle = `rgba(${r},${g},${b},${lerp(dotOpacity, 1, e)})`;
        // Snap to device pixels so the finished W lines up with the crisp logo.
        const px = Math.round(x * dpr), py = Math.round(y * dpr);
        ctx.fillRect(px,
                     py,
                     Math.max(1, Math.round((x + size) * dpr) - px),
                     Math.max(1, Math.round((y + size) * dpr) - py));
    }

    function playIntro(wave, logo, dotColor) {
        const flights = planFlights(
            wPixels(logo, cssValue('--brand-ink')),
            visibleDots(wave),
        );
        const borrowed = flights.map((f) => f.from.index).filter((i) => i !== null);
        setDotAlpha(wave, borrowed, 0);

        const { canvas, ctx, dpr } = createOverlay();
        const dotRgb = hexToRgb(dotColor);
        const total = Math.max(...flights.map((f) => f.delay + f.duration)) + CONFIG.intro.holdMs;
        const logoFade = cssMs('--intro-logo-fade');
        const canvasFade = cssMs('--intro-canvas-fade');
        const start = performance.now();
        let finished = false;

        // Targets are fixed to where the logo was when the intro began, so a scroll or
        // resize mid-flight ends the intro and shows the logo straight away.
        const abort = () => finish(true);
        window.addEventListener('scroll', abort, { passive: true });
        window.addEventListener('resize', abort);

        function finish(aborted) {
            if (finished) return;
            finished = true;
            window.removeEventListener('scroll', abort);
            window.removeEventListener('resize', abort);
            revealLogo();
            // Let the logo become fully opaque, then fade the dot W out beneath it.
            const handoff = aborted ? 0 : logoFade;
            setTimeout(() => {
                canvas.style.opacity = '0';
                setTimeout(() => canvas.remove(), canvasFade);
            }, handoff);
            wave.returning = { start: performance.now() + handoff, indices: borrowed };
        }

        (function frame(now) {
            if (finished) return;
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            flights.forEach((f) => drawFlight(ctx, dpr, f, elapsed, dotRgb, CONFIG.wave.opacity));
            if (elapsed < total) requestAnimationFrame(frame);
            else finish(false);
        })(start);
    }

    function startIntro(wave, logo, dotColor) {
        if (!root.classList.contains('intro')) return;     // not this visit
        if (!wave || performance.now() > CONFIG.intro.latestStartMs) {
            revealLogo();                                    // no WebGL, or a slow connection
            return;
        }
        // Wait two frames so the hero has laid out and the wave has drawn once.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!root.classList.contains('intro')) return;
            root.classList.add('intro-playing');             // the intro owns the reveal now
            playIntro(wave, logo, dotColor);
        }));
    }

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------
    function init() {
        const container = document.querySelector('.hero-wave');
        const logo = document.querySelector('.hero-logo');
        if (!container || !logo) return;

        const motionOk = typeof THREE !== 'undefined' && !reducedMotion();
        const dotColor = cssValue('--brand-lime') || '#9bd94a';
        const wave = motionOk ? createWave(container, dotColor) : null;
        startIntro(wave, logo, dotColor);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
