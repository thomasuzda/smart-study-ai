/* ===========================================================================
   constellation.js — the landing background

   Dim points drifting slowly, joined by thin lines when they pass close to
   each other. Restrained on purpose: this sits underneath the headline, so its
   job is to add depth without competing for attention.

   Technique adapted from ThreeUI's Constellation Field, MIT licensed,
   Copyright (c) 2026 Meng To — https://github.com/MengTo/threeui
   Written against this app's palette rather than copied.

   Canvas 2D, no dependencies. Unlike the version this replaces, the headline
   is real HTML sitting on top — selectable, resizable, and readable by search
   engines and screen readers.
   =========================================================================== */

const Constellation = (function () {
  const CFG = {
    /* Node count scales with area rather than being fixed, or a wide monitor
       looks sparse and a phone looks like static. */
    density: 1 / 16000,   // nodes per square pixel
    maxNodes: 130,
    minNodes: 34,

    linkDistance: 150,    // px within which two nodes are joined
    speed: 0.12,          // px per frame — slow enough to feel ambient
    dotRadius: 1.5,
    pointerRadius: 190,   // nodes nearer than this react to the cursor

    dotAlpha: 0.42,
    lineAlpha: 0.26,
  };

  let canvas, ctx, container;
  let width = 0, height = 0, dpr = 1;
  let nodes = [];
  let frame = null;
  const pointer = { x: -9999, y: -9999 };

  function build() {
    const target = Math.round(width * height * CFG.density);
    const count = Math.max(CFG.minNodes, Math.min(CFG.maxNodes, target));
    nodes = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * CFG.speed,
        vy: Math.sin(angle) * CFG.speed,
        // A little size variation stops it reading as a regular grid.
        r: CFG.dotRadius * (0.6 + Math.random() * 0.8),
      });
    }
  }

  /* Colours come from the stylesheet so the field follows the palette rather
     than hardcoding a blue that would drift out of step with the app. */
  function accent() {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim();
    return value || '#0a84ff';
  }

  function toRGB(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  let rgb = [10, 132, 255];

  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const [r, g, b] = rgb;

    /* Lines first, so the dots sit on top of their own connections rather
       than being crossed by them. */
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const c = nodes[j];
        const dx = a.x - c.x;
        const dy = a.y - c.y;
        // Compare squared distances to skip a square root per pair.
        const d2 = dx * dx + dy * dy;
        if (d2 > CFG.linkDistance * CFG.linkDistance) continue;

        const d = Math.sqrt(d2);
        // Fade with distance, so links appear and dissolve rather than
        // snapping in and out as nodes drift past each other.
        const strength = 1 - d / CFG.linkDistance;
        ctx.strokeStyle =
          'rgba(' + r + ',' + g + ',' + b + ',' + (strength * CFG.lineAlpha).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }

    // Faint lines to the cursor, so the field acknowledges the pointer without
    // lunging at it.
    if (pointer.x > -9000) {
      for (const n of nodes) {
        const dx = n.x - pointer.x;
        const dy = n.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > CFG.pointerRadius * CFG.pointerRadius) continue;
        const strength = 1 - Math.sqrt(d2) / CFG.pointerRadius;
        ctx.strokeStyle =
          'rgba(' + r + ',' + g + ',' + b + ',' + (strength * 0.5).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }

    for (const n of nodes) {
      ctx.fillStyle =
        'rgba(' + r + ',' + g + ',' + b + ',' + CFG.dotAlpha + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step() {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      // Wrap with a margin, so a node leaves and returns rather than visibly
      // popping at the exact edge.
      const m = 30;
      if (n.x < -m) n.x = width + m;
      if (n.x > width + m) n.x = -m;
      if (n.y < -m) n.y = height + m;
      if (n.y > height + m) n.y = -m;
    }
  }

  function draw() {
    step();
    paint();
    frame = requestAnimationFrame(draw);
  }

  function start() { if (frame === null && ctx) frame = requestAnimationFrame(draw); }
  function stop() { if (frame !== null) { cancelAnimationFrame(frame); frame = null; } }

  function resize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    width = w; height = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    rgb = toRGB(accent());
    build();
    // Resizing clears the canvas; if the loop is stopped nothing would repaint
    // it and the background would simply vanish.
    if (frame === null) paint();
  }

  function visible() {
    const landing = document.getElementById('screen-landing');
    return !!landing && !landing.hidden && !document.hidden;
  }

  function sync() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (visible()) start(); else stop();
  }

  function init() {
    container = document.getElementById('constellation');
    if (!container) return;

    canvas = document.createElement('canvas');
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    resize();

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(); // one still frame, no loop
      return;
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);

    container.ownerDocument.addEventListener('pointermove', function (e) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    });
    container.ownerDocument.addEventListener('pointerleave', function () {
      pointer.x = pointer.y = -9999;
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      rgb = toRGB(accent());
    });

    paint();
    if (!document.hidden) start();
  }

  return { init: init, sync: sync, isRunning: function () { return frame !== null; } };
})();

window.Constellation = Constellation; // ui.js calls Constellation.sync() on screen change

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Constellation.init);
} else {
  Constellation.init();
}
