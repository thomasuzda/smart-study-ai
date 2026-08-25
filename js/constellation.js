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

    /* How far apart two nodes can be and still be joined — as a multiple of
       the typical gap between nodes, NOT a fixed pixel count. A fixed 150px
       looked right on a desktop but turned a phone into a tangle: minNodes
       forces the count up on a small screen, which packs the nodes closer
       (about 95px apart instead of 126px) while the link radius stayed put.
       The ratio was 1.58 on a phone against 1.19 on a desktop, so nearly
       every node joined every neighbour. Tying it to spacing keeps the same
       openness on any screen; 1.19 is the desktop value that already looked
       right, so big screens are unchanged. */
    linkRatio: 1.19,
    maxLinkDistance: 170, // ceiling, so a huge sparse screen keeps lines short

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
  let linkDistance = 150; // recomputed from the box size in build()

  /* Where the finger or cursor is, in canvas space. Recomputed once per frame
     from `input` below rather than on every move event — reading an element's
     position forces the browser to settle layout, and doing that on every
     touchmove is a classic source of scroll jank. */
  const pointer = { x: -9999, y: -9999 };

  /* The raw event position, in viewport coordinates. `active` is what makes
     touch behave: a mouse hovers without pressing, but a finger only counts
     while it's actually down. */
  const input = { cx: 0, cy: 0, active: false };

  /* Precomputed 'rgba(r,g,b,a)' strings, one per alpha step. Building these
     with string concatenation and toFixed() inside the link loop meant a
     fresh string per line per frame — the kind of allocation churn a phone
     notices. Rebuilt only when the accent colour changes. */
  const ALPHA_STEPS = 24;
  let lineStyles = [];
  let dotStyle = 'rgba(10,132,255,0.42)';

  function buildStyles() {
    const [r, g, b] = rgb;
    lineStyles = [];
    for (let i = 0; i <= ALPHA_STEPS; i++) {
      const a = (i / ALPHA_STEPS) * CFG.lineAlpha;
      lineStyles.push('rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')');
    }
    dotStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + CFG.dotAlpha + ')';
  }

  function makeNode(x, y) {
    const angle = Math.random() * Math.PI * 2;
    return {
      x: x === undefined ? Math.random() * width : x,
      y: y === undefined ? Math.random() * height : y,
      vx: Math.cos(angle) * CFG.speed,
      vy: Math.sin(angle) * CFG.speed,
      // A little size variation stops it reading as a regular grid.
      r: CFG.dotRadius * (0.6 + Math.random() * 0.8),
    };
  }

  /**
   * Place `count` nodes so they cover the box evenly.
   *
   * Purely random placement clumps: on a desktop the high node count averages
   * that out, but a phone only gets ~34 and the result was knots of nodes with
   * large empty voids between them. So the box is divided into a grid of cells
   * and one node is dropped at a random spot inside each — even coverage, but
   * jittered, so it never reads as a regular lattice.
   */
  function scatter(count) {
    // Cells that come out roughly square, whatever the box's aspect ratio.
    const cols = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellW = width / cols;
    const cellH = height / rows;

    const out = [];
    for (let i = 0; i < count; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      out.push(makeNode(
        (cx + Math.random()) * cellW,
        (cy + Math.random()) * cellH
      ));
    }
    return out;
  }

  /**
   * Size the field to the current box.
   *
   * prevW/prevH are the dimensions this replaces. When they're given, the
   * existing nodes are stretched into the new box rather than thrown away:
   * a resize should slide the stars into place, not deal a whole new sky.
   * Rebuilding from scratch made every resize — rotating a phone, dragging a
   * window edge — visibly reshuffle the entire background.
   */
  function build(prevW, prevH) {
    const target = Math.round(width * height * CFG.density);
    const count = Math.max(CFG.minNodes, Math.min(CFG.maxNodes, target));

    // The gap you'd expect between neighbours if they were evenly spread.
    const spacing = Math.sqrt((width * height) / count);
    linkDistance = Math.min(CFG.maxLinkDistance, spacing * CFG.linkRatio);

    if (nodes.length && prevW > 0 && prevH > 0) {
      const sx = width / prevW;
      const sy = height / prevH;
      for (const n of nodes) { n.x *= sx; n.y *= sy; }
      // Then top up or trim to whatever the new area calls for.
      while (nodes.length > count) nodes.pop();
      while (nodes.length < count) nodes.push(makeNode());
      return;
    }

    nodes = scatter(count);
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

  /* One layout read per frame, not one per move event. */
  function resolvePointer() {
    if (!input.active) { pointer.x = pointer.y = -9999; return; }
    const r = canvas.getBoundingClientRect();
    pointer.x = input.cx - r.left;
    pointer.y = input.cy - r.top;
  }

  function paint() {
    resolvePointer();

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
        if (d2 > linkDistance * linkDistance) continue;

        const d = Math.sqrt(d2);
        // Fade with distance, so links appear and dissolve rather than
        // snapping in and out as nodes drift past each other.
        const strength = 1 - d / linkDistance;
        ctx.strokeStyle = lineStyles[(strength * ALPHA_STEPS) | 0];
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

    ctx.fillStyle = dotStyle;
    for (const n of nodes) {
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
    const prevW = width, prevH = height;
    width = w; height = h;
    /* A phone reports devicePixelRatio 3, so a full-screen canvas at the old
       cap of 2 meant clearing and repainting well over a million pixels every
       frame. Capping to 1.5 on touch devices roughly halves that. The field is
       dim dots and hairlines on near-black, so the softening is invisible in
       a way it would not be on text — and smoothness is the thing being
       bought. Desktops, which have the headroom, keep the sharper 2. */
    const coarse = matchMedia('(pointer: coarse)').matches;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    rgb = toRGB(accent());
    buildStyles();
    build(prevW, prevH);
    // Resizing clears the canvas; if the loop is stopped nothing would repaint
    // it and the background would simply vanish.
    if (frame === null) paint();
  }

  /* Set by the IntersectionObserver in init(). Starts true so the first frame
     paints before the observer has had a chance to report. */
  let onScreen = true;

  function visible() {
    const landing = document.getElementById('screen-landing');
    return !!landing && !landing.hidden && !document.hidden && onScreen;
  }

  function sync() {
    if (!container) return;

    /* Re-measure on the way back onto the landing. The ResizeObserver above
       covers live window dragging, but its callback is delivered with the
       browser's rendering steps, which are suspended in a background tab —
       so a resize that happened while the tab was hidden, or while another
       screen was showing, might not have landed yet. This check is synchronous
       and costs one layout read, and resize() ignores a zero-sized container. */
    if (container.clientWidth &&
        (container.clientWidth !== width || container.clientHeight !== height)) {
      resize();
    }

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

    /* A plain window 'resize' listener isn't enough: while the landing is on
       another screen the container is display:none and measures 0, so resize()
       bails and the canvas keeps its old size. Come back and CSS stretches
       that stale bitmap to fit. A ResizeObserver fires whenever the container's
       own box changes — including 0 -> full when it becomes visible again — so
       the two can't drift apart. */
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(resize).observe(container);
    } else {
      window.addEventListener('resize', resize);
    }
    document.addEventListener('visibilitychange', sync);

    /* The hero is only the first screenful. Once it has scrolled away there is
       nothing to look at, but the loop was still clearing and repainting a
       full-screen canvas every frame — wasted work competing with the scroll
       itself for the main thread. This stops it as soon as the hero leaves,
       and starts it again when it comes back. */
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(container);
    }

    /* Touch and mouse both drive the field, but they can't be treated the
       same. A mouse hovers, so it follows without pressing. A finger has no
       hover, so it only counts while it's actually down — otherwise the fan
       of lines sticks wherever you last tapped and looks broken.

       Every listener is passive. A non-passive touch listener forces the
       browser to wait and see whether the handler will cancel the gesture
       before it can scroll, which is exactly the lag to avoid here.

       Scrolling always wins: when the browser decides a drag is a scroll it
       fires pointercancel, and the fan clears. So a vertical swipe scrolls
       the page as normal, while a press or a sideways drag plays with the
       field. Nothing fights the user for the gesture. */
    const doc = container.ownerDocument;
    const passive = { passive: true };

    doc.addEventListener('pointerdown', function (e) {
      input.cx = e.clientX;
      input.cy = e.clientY;
      input.active = true;
    }, passive);

    doc.addEventListener('pointermove', function (e) {
      // A mouse needs no press; a finger must already be down.
      if (e.pointerType === 'mouse') {
        input.cx = e.clientX;
        input.cy = e.clientY;
        input.active = true;
        return;
      }
      if (input.active) {
        input.cx = e.clientX;
        input.cy = e.clientY;
      }
    }, passive);

    const release = function (e) {
      // A mouse lifting its button hasn't left the screen, so it keeps
      // following. A finger lifting is gone.
      if (!e || e.pointerType !== 'mouse') input.active = false;
    };

    doc.addEventListener('pointerup', release, passive);
    doc.addEventListener('pointercancel', release, passive);
    doc.addEventListener('pointerleave', function () {
      input.active = false;
    }, passive);

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      rgb = toRGB(accent());
      buildStyles();
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
