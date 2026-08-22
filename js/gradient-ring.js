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
    tiles: 12,   // one per entry in SUBJECTS
    axisDeg: 24,      // screen angle of the ring's major axis
    tiltDeg: 68,      // how far the ring is tipped away from the viewer
    ringRadius: 0.42, // as a fraction of the smaller viewport side
    tileSize: 0.19,   // ditto
    corner: 0.22,     // corner radius as a fraction of the tile
    speed: 0.00016,   // radians per millisecond — deliberately slow
    perspective: 0.55,
  };

  /* One per tile. Kept to single short words: anything longer shrinks to
     unreadable once a tile is scaled down and rotated on the far side of the
     ring. Ordered so related subjects aren't adjacent, since neighbouring
     tiles overlap and similar words blur together. */
  /* Each subject gets a drawn symbol rather than only its name. An icon is
     recognised at a glance; a word has to be read, which is a lot to ask of a
     tile that is small, tilted and drifting past.

     Drawn with canvas paths in a normalised -1..1 box and scaled to the tile,
     so they stay crisp at any size — no image files, no icon font, nothing to
     download. Stroked rather than filled: thin line work stays legible on top
     of a bright gradient where a solid shape would just read as a blob. */
  const ICONS = {
    // DNA — two crossing strands with rungs between them
    BIOLOGY: function (c) {
      // Two strands, one a half-turn out of phase with the other.
      for (const dir of [1, -1]) {
        c.beginPath();
        for (let t = 0; t <= 1.001; t += 0.04) {
          const y = -0.95 + t * 1.9;
          const x = dir * 0.5 * Math.sin(t * Math.PI * 2 + Math.PI / 2);
          t === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
      // Rungs only where the strands are far apart — at a crossing point the
      // rung has no length and simply disappears, which is what made this
      // read as a stack of triangles rather than a helix.
      for (const t of [0.06, 0.2, 0.8, 0.94]) {
        const y = -0.95 + t * 1.9;
        const x = 0.5 * Math.sin(t * Math.PI * 2 + Math.PI / 2);
        c.beginPath(); c.moveTo(-x, y); c.lineTo(x, y); c.stroke();
      }
    },

    // The integral sign
    CALCULUS: function (c) {
      c.beginPath();
      c.moveTo(0.45, -0.85);
      c.bezierCurveTo(0.45, -1.15, -0.2, -1.0, -0.2, -0.45);
      c.lineTo(-0.2, 0.45);
      c.bezierCurveTo(-0.2, 1.0, -0.85, 1.15, -0.85, 0.85);
      c.stroke();
    },

    // A classical column
    HISTORY: function (c) {
      c.beginPath(); c.moveTo(-0.8, -0.8); c.lineTo(0.8, -0.8); c.stroke();
      c.beginPath(); c.moveTo(-0.8, 0.85); c.lineTo(0.8, 0.85); c.stroke();
      for (const x of [-0.45, 0, 0.45]) {
        c.beginPath(); c.moveTo(x, -0.65); c.lineTo(x, 0.7); c.stroke();
      }
    },

    // Conical flask
    CHEMISTRY: function (c) {
      c.beginPath();
      c.moveTo(-0.28, -0.9); c.lineTo(-0.28, -0.25);
      c.lineTo(-0.8, 0.75);
      c.quadraticCurveTo(-0.9, 0.95, -0.65, 0.95);
      c.lineTo(0.65, 0.95);
      c.quadraticCurveTo(0.9, 0.95, 0.8, 0.75);
      c.lineTo(0.28, -0.25); c.lineTo(0.28, -0.9);
      c.stroke();
      c.beginPath(); c.moveTo(-0.45, -0.9); c.lineTo(0.45, -0.9); c.stroke();
    },

    // Atom — nucleus with orbits
    PHYSICS: function (c) {
      c.beginPath(); c.arc(0, 0, 0.16, 0, Math.PI * 2); c.fill();
      for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
        c.save(); c.rotate(a);
        c.beginPath(); c.ellipse(0, 0, 0.95, 0.4, 0, 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    },

    // Speech bubble
    SPANISH: function (c) {
      c.beginPath();
      c.moveTo(-0.85, -0.2);
      c.quadraticCurveTo(-0.85, -0.8, -0.2, -0.8);
      c.lineTo(0.35, -0.8);
      c.quadraticCurveTo(0.9, -0.8, 0.9, -0.2);
      c.quadraticCurveTo(0.9, 0.35, 0.35, 0.35);
      c.lineTo(-0.25, 0.35);
      c.lineTo(-0.6, 0.85);
      c.lineTo(-0.55, 0.35);
      c.quadraticCurveTo(-0.85, 0.3, -0.85, -0.2);
      c.closePath(); c.stroke();
    },

    // Heart
    ANATOMY: function (c) {
      c.beginPath();
      c.moveTo(0, 0.85);
      c.bezierCurveTo(-1.15, 0.05, -0.7, -0.9, 0, -0.35);
      c.bezierCurveTo(0.7, -0.9, 1.15, 0.05, 0, 0.85);
      c.closePath(); c.stroke();
    },

    // Bar chart
    STATISTICS: function (c) {
      const bars = [[-0.6, 0.15], [0, -0.4], [0.6, -0.75]];
      for (const [x, top] of bars) {
        c.beginPath();
        c.moveTo(x, 0.8); c.lineTo(x, top);
        c.stroke();
      }
      c.beginPath(); c.moveTo(-0.9, 0.85); c.lineTo(0.9, 0.85); c.stroke();
    },

    // Head in profile with a spiral inside
    PSYCHOLOGY: function (c) {
      /* A head in profile, with no neck. Earlier versions drew one, and at
         tile size the two little vertical lines read as a stick — the whole
         thing looked like a balloon rather than a head. The silhouette alone
         is clearer. */
      c.beginPath();
      c.moveTo(0.15, 0.9);
      c.quadraticCurveTo(-0.95, 0.75, -0.95, -0.15);
      c.quadraticCurveTo(-0.95, -0.95, -0.05, -0.95);
      c.quadraticCurveTo(0.9, -0.95, 0.9, -0.05);
      c.quadraticCurveTo(0.9, 0.55, 0.15, 0.9);
      c.closePath();
      c.stroke();
      // A spiral for the mind, sitting inside the skull.
      c.beginPath();
      for (let t = 0; t < Math.PI * 2.8; t += 0.14) {
        const r = 0.05 + t * 0.055;
        const x = -0.05 + Math.cos(t) * r;
        const y = -0.15 + Math.sin(t) * r;
        t === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    },

    // Rising line with an arrow head
    ECONOMICS: function (c) {
      c.beginPath();
      c.moveTo(-0.85, 0.6); c.lineTo(-0.25, -0.05);
      c.lineTo(0.15, 0.35); c.lineTo(0.8, -0.6);
      c.stroke();
      c.beginPath();
      c.moveTo(0.35, -0.6); c.lineTo(0.85, -0.6); c.lineTo(0.85, -0.1);
      c.stroke();
    },

    // A logic gate with two inputs and an output
    LOGIC: function (c) {
      c.beginPath();
      c.moveTo(-0.3, -0.7); c.lineTo(0.15, -0.7);
      c.arc(0.15, 0, 0.7, -Math.PI / 2, Math.PI / 2);
      c.lineTo(-0.3, 0.7); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-0.85, -0.35); c.lineTo(-0.3, -0.35); c.stroke();
      c.beginPath(); c.moveTo(-0.85, 0.35); c.lineTo(-0.3, 0.35); c.stroke();
      c.beginPath(); c.moveTo(0.85, 0); c.lineTo(0.95, 0); c.stroke();
    },

    // Medical cross
    NURSING: function (c) {
      c.beginPath();
      c.moveTo(-0.28, -0.85); c.lineTo(0.28, -0.85); c.lineTo(0.28, -0.28);
      c.lineTo(0.85, -0.28); c.lineTo(0.85, 0.28); c.lineTo(0.28, 0.28);
      c.lineTo(0.28, 0.85); c.lineTo(-0.28, 0.85); c.lineTo(-0.28, 0.28);
      c.lineTo(-0.85, 0.28); c.lineTo(-0.85, -0.28); c.lineTo(-0.28, -0.28);
      c.closePath(); c.stroke();
    },
  };

  const SUBJECTS = Object.keys(ICONS);

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

  function buildTile(colours, size, label) {
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

    /* The symbol, drawn in the upper part of the tile. A translucent dark
       disc sits behind it for the same reason the label has a scrim: several
       of these gradients go pale, and white line work vanishes on them. */
    if (label && ICONS[label]) {
      const cx = size / 2;
      const cy = size * 0.42;
      const unit = size * 0.17;

      g.save();
      g.beginPath();
      g.arc(cx, cy, unit * 1.85, 0, Math.PI * 2);
      g.fillStyle = 'rgba(4, 8, 16, 0.34)';
      g.fill();
      g.restore();

      g.save();
      g.translate(cx, cy);
      g.scale(unit, unit);
      // Stroke width is in the scaled space, so divide to keep it constant
      // regardless of tile size.
      g.lineWidth = 0.16;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 0.35;
      ICONS[label](g);
      g.restore();
    }

    /* The subject name, under the symbol. Some of these gradients are pale at
       one corner, so the label gets a dark scrim rather than relying on the
       shadow — white-on-cyan is unreadable without one. */
    if (label) {
      const pad = size * 0.1;
      let fontSize = size * 0.105;
      g.font = '600 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

      // Shrink long words to fit rather than letting them run off the tile.
      const maxWidth = size - pad * 2;
      while (g.measureText(label).width > maxWidth && fontSize > size * 0.07) {
        fontSize -= size * 0.005;
        g.font = '600 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
      }

      const textWidth = g.measureText(label).width;
      const barHeight = fontSize * 2.0;
      const barY = size - barHeight - pad * 0.6;

      g.fillStyle = 'rgba(4, 8, 16, 0.55)';
      g.fillRect(0, barY, size, barHeight);

      g.fillStyle = 'rgba(255,255,255,0.96)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = fontSize * 0.5;
      g.fillText(label, size / 2, barY + barHeight / 2);
      g.shadowBlur = 0;
    }

    return c;
  }

  /* Where the ring and headline sit vertically. On a phone the hero is tall
     and narrow, and a centred ring lands right on top of the tagline — so it
     moves up into the empty space above it. */
  function centreY() {
    return height * (width < 700 ? 0.38 : 0.5);
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
    const top = centreY() - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (line, i) {
      g.fillText(line, width / 2, top + i * lineHeight);
    });
    return c;
  }

  /* ---------------------------------------------------------------------
     DRAWING
     --------------------------------------------------------------------- */

  function paint(now) {
    const t = now - startedAt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    pointerX += (pointerTargetX - pointerX) * 0.05;

    // Base the ring on width alone below 700px: on a tall phone screen,
    // using the smaller side made the ring shrink and the tiles crowd.
    const base = width < 700 ? width : Math.min(width, height);
    const R = base * (width < 700 ? 0.40 : CFG.ringRadius);
    const TS = base * (width < 700 ? 0.21 : CFG.tileSize);

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

    const cy = centreY();

    ctx.save();
    ctx.translate(width / 2, cy);

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
        ctx.translate(width / 2, cy);
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
  }

  function draw(now) {
    paint(now);
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

    const base = width < 700 ? width : Math.min(width, height);
    const tilePx = Math.round(base * (width < 700 ? 0.21 : CFG.tileSize) * dpr);
    tileCanvases = SUBJECTS.map(function (subject, i) {
      return buildTile(PALETTES[i % PALETTES.length], tilePx, subject);
    });
    headline = buildHeadline();

    /* Resizing clears the canvas. If the loop happens to be stopped — reduced
       motion, a background tab, or another screen showing — nothing would
       repaint it and the hero would simply be blank. */
    if (frame === null && ctx) paint(performance.now());
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
      paint(performance.now());   // one still frame, no loop
      return;
    }

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointermove', function (e) {
      pointerTargetX = (e.clientX / window.innerWidth) * 2 - 1;
    });

    // Paint immediately either way, so a page opened in a background tab is
    // never blank — requestAnimationFrame doesn't run while hidden.
    paint(performance.now());
    if (!document.hidden) start();
  }

  return { init: init, sync: sync, isRunning: function () { return frame !== null; } };
})();

window.VoidField = GradientRing; // ui.js calls VoidField.sync() on screen change

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', GradientRing.init);
} else {
  GradientRing.init();
}
