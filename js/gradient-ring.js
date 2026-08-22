/* ===========================================================================
   gradient-ring.js — the landing hero

   A ring of gradient tiles orbiting in perspective, with the headline woven
   through it: tiles behind the text draw first, then the text, then the tiles
   in front. That interleaving is the whole trick, and it's why the headline
   appears to pass through the ring rather than sit on top of a picture.

   Technique adapted from ThreeUI's Gradient Collection, MIT licensed,
   Copyright (c) 2026 Meng To — https://github.com/MengTo/threeui
   Written fresh against this app's content and palette rather than copied.

   Canvas 2D on purpose. The previous hero pulled in three.js at ~600 KB for
   a background; this is a few KB and no dependency at all.
   =========================================================================== */

const GradientRing = (function () {
  const CFG = {
    tiles: 12,
    axisDeg: 24,      // screen angle of the ring's major axis
    tiltDeg: 68,      // how far the ring is tipped away from the viewer
    ringRadius: 0.42, // as a fraction of the smaller viewport side
    tileSize: 0.19,   // ditto
    corner: 0.22,     // corner radius as a fraction of the tile
    speed: 0.00016,   // radians per millisecond — deliberately slow
    perspective: 0.55,
  };

  /* Tile gradients. Blues and cyans to match the app, with two warm tiles so
     the ring has a focal point instead of reading as one flat colour. */
  const PALETTES = [
    ['#0ea5e9', '#1e3a8a', '#0c4a6e'],
    ['#38bdf8', '#0369a1', '#082f49'],
    ['#7dd3fc', '#0284c7', '#1e1b4b'],
    ['#a78bfa', '#4c1d95', '#0f172a'],
    ['#f97316', '#7c2d12', '#0f172a'],
    ['#22d3ee', '#0e7490', '#083344'],
    ['#818cf8', '#3730a3', '#0f172a'],
    ['#fb7185', '#881337', '#0f172a'],
  ];

  let canvas, ctx, container;
  let width = 0, height = 0, dpr = 1;
  let frame = null;
  let startedAt = 0;
  let headline = null;      // offscreen canvas holding the text
  let tileCanvases = [];    // one pre-rendered gradient per tile
  let pointerX = 0, pointerTargetX = 0;

  /* ---------------------------------------------------------------------
     PRE-RENDERING
     Tiles and text are drawn once into their own canvases and then just
     stamped each frame. Re-creating gradients 12 times per frame is the
     obvious way to make a Canvas 2D scene stutter.
     --------------------------------------------------------------------- */

  function roundRect(c, w, h, r) {
    c.beginPath();
    c.moveTo(-w / 2 + r, -h / 2);
    c.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
    c.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
    c.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
    c.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
    c.closePath();
  }

  function buildTile(colours, size) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(size);
    const g = c.getContext('2d');

    // Diagonal base gradient
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, colours[0]);
    grad.addColorStop(0.55, colours[1]);
    grad.addColorStop(1, colours[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);

    // A soft bright streak across the middle, which is what gives these the
    // look of light bending through glass rather than a flat swatch.
    const streak = g.createLinearGradient(0, size * 0.35, size, size * 0.65);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    streak.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = streak;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'source-over';

    /* Fine grain, so large gradients don't band into visible steps.

       It goes onto its own canvas first and is then composited across.
       putImageData writes raw pixels — it ignores globalAlpha and blending
       entirely — so applying the noise directly would replace the gradient
       with the noise rather than overlaying it, leaving a black tile. */
    const noise = document.createElement('canvas');
    noise.width = noise.height = Math.round(size);
    const ng = noise.getContext('2d');
    const grain = ng.createImageData(noise.width, noise.height);
    for (let i = 0; i < grain.data.length; i += 4) {
      const n = (Math.random() * 255) | 0;
      grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = n;
      grain.data[i + 3] = 255;
    }
    ng.putImageData(grain, 0, 0);

    g.globalAlpha = 0.06;
    g.globalCompositeOperation = 'overlay';
    g.drawImage(noise, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    return c;
  }

  function buildHeadline() {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');

    const lines = ['SMART', 'STUDY AI'];
    // Scale with the viewport so it fills the width without wrapping.
    const size = Math.min(width * 0.155, height * 0.2);
    g.font = '800 ' + size + 'px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = size * 0.25;

    const lineHeight = size * 0.92;
    const top = height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (line, i) {
      g.fillText(line, width / 2, top + i * lineHeight);
    });
    return c;
  }

  /* ---------------------------------------------------------------------
     DRAWING
     --------------------------------------------------------------------- */

  function draw(now) {
    const t = now - startedAt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    pointerX += (pointerTargetX - pointerX) * 0.05;

    const min = Math.min(width, height);
    const R = min * CFG.ringRadius;
    const TS = min * CFG.tileSize;

    const ax = (CFG.axisDeg * Math.PI) / 180;
    const tilt = (CFG.tiltDeg * Math.PI) / 180;
    const cf = Math.cos(tilt);
    const sf = Math.sin(tilt);

    /* Two basis vectors spanning the ring's plane. U runs along the major
       axis; V is tipped away from the viewer, so its z component is what
       decides which tiles are in front. */
    const U = [Math.cos(ax), Math.sin(ax), 0];
    const V = [-Math.sin(ax) * cf, Math.cos(ax) * cf, sf];

    const spin = t * CFG.speed + pointerX * 0.35;

    const tiles = [];
    for (let i = 0; i < CFG.tiles; i++) {
      const psi = spin + (i / CFG.tiles) * Math.PI * 2;
      const c = Math.cos(psi);
      const s = Math.sin(psi);
      tiles.push({
        i: i,
        x: (c * U[0] + s * V[0]) * R,
        y: (c * U[1] + s * V[1]) * R,
        z: c * U[2] + s * V[2],
        psi: psi,
      });
    }

    // Painter's algorithm: furthest first, so nearer tiles overlap them.
    tiles.sort(function (a, b) { return a.z - b.z; });

    ctx.save();
    ctx.translate(width / 2, height / 2);

    let textDrawn = false;
    for (let k = 0; k < tiles.length; k++) {
      const tile = tiles[k];

      /* The headline goes in the middle of the stack: after everything behind
         the ring's centre, before everything in front. That single insertion
         is what makes the words appear to pass through the ring. */
      if (!textDrawn && tile.z > 0) {
        ctx.restore();
        ctx.drawImage(headline, 0, 0, width, height);
        ctx.save();
        ctx.translate(width / 2, height / 2);
        textDrawn = true;
      }

      // Nearer tiles are larger and more opaque.
      const depth = (tile.z + 1) / 2;            // 0 far, 1 near
      const scale = 0.62 + depth * CFG.perspective;
      const alpha = 0.3 + depth * 0.58;

      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.rotate(Math.sin(tile.psi) * 0.22);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = TS * 0.35;
      ctx.shadowOffsetY = TS * 0.08;

      roundRect(ctx, TS, TS, TS * CFG.corner);
      ctx.clip();
      ctx.drawImage(tileCanvases[tile.i % tileCanvases.length],
        -TS / 2, -TS / 2, TS, TS);
      ctx.restore();
    }

    // If every tile happened to be behind the midpoint, the text still needs
    // drawing — otherwise the headline would vanish for part of each turn.
    if (!textDrawn) {
      ctx.restore();
      ctx.drawImage(headline, 0, 0, width, height);
      ctx.save();
    }

    ctx.restore();
    frame = requestAnimationFrame(draw);
  }

  /* ---------------------------------------------------------------------
     LIFECYCLE
     --------------------------------------------------------------------- */

  function resize() {
    if (!container) return;
    width = container.clientWidth;
    height = container.clientHeight;
    if (!width || !height) return;
    // Cap the pixel ratio: on a 3x phone screen this would otherwise paint
    // nine times the pixels for no visible gain.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const min = Math.min(width, height);
    const tilePx = Math.round(min * CFG.tileSize * dpr);
    tileCanvases = PALETTES.map(function (p) { return buildTile(p, tilePx); });
    headline = buildHeadline();
  }

  function start() {
    if (frame === null && ctx) {
      startedAt = performance.now() - 4000; // begin part-way round, not static
      frame = requestAnimationFrame(draw);
    }
  }

  function stop() {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
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
    container = document.getElementById('void-field');
    if (!container) return;

    canvas = document.createElement('canvas');
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) { document.body.classList.add('hero-static'); return; }

    resize();

    // Motion sickness is a real thing and this ring is large and rotating.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(performance.now());   // one still frame
      cancelAnimationFrame(frame);
      frame = null;
      return;
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointermove', function (e) {
      pointerTargetX = (e.clientX / window.innerWidth) * 2 - 1;
    });

    if (!document.hidden) start();
    else draw(performance.now()), cancelAnimationFrame(frame), (frame = null);
  }

  return { init: init, sync: sync, isRunning: function () { return frame !== null; } };
})();

window.VoidField = GradientRing; // ui.js calls VoidField.sync() on screen change

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', GradientRing.init);
} else {
  GradientRing.init();
}
