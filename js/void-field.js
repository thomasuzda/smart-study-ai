/* ===========================================================================
   void-field.js — the drifting particle background on the landing page

   Built with three.js, loaded straight from a CDN by the import map in
   index.html. No build step: the browser fetches three.js and this file runs
   as-is, the same way the Supabase library already loads.

   Three things this is careful about, none of them optional for a background
   that runs while someone is trying to read:

   1. It stops when it isn't visible — off the landing page, or the tab in the
      background. A WebGL loop left running is a flat battery on a laptop.
   2. It honours prefers-reduced-motion by not starting at all. Drifting
      particles are exactly the kind of motion that makes some people ill.
   3. It fails silently. If WebGL is unavailable the page simply has a plain
      background instead of an error.
   =========================================================================== */

import * as THREE from 'three';

const CONFIG = {
  count: 1400,        // particles. Cheap, but not free — this is a good balance.
  spread: 60,         // how far they scatter horizontally/vertically
  depth: 22,          // how far they scatter toward the camera. Kept much
                      // shallower than `spread` because size attenuation makes
                      // near particles enormous — that's what turned them into
                      // chunky blocks rather than a fine field.
  drift: 0.012,       // vertical drift speed
  rotation: 0.00018,  // very slow rotation of the whole field
  parallax: 1.6,      // how far the camera leans toward the pointer
  size: 0.30,
};

let renderer, scene, camera, points, material;
let frame = null;
let container = null;

const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

/* Read colours from the stylesheet rather than hardcoding them, so the field
   follows light/dark mode and any future palette change automatically. */
function themeColor() {
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#0071e3';
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return { accent: new THREE.Color(accent), dark };
}

/* Draw a soft circular dot into an offscreen canvas and use it as the point
   sprite. Without a texture every particle is a hard square, which is what
   made the first version look pixelated. */
function dotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function build() {
  const { accent, dark } = themeColor();

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    200
  );
  camera.position.z = 34;

  /* Positions and per-particle colour, generated once. Particles nearer the
     centre are tinted toward the accent colour and the ones further out fade
     to grey, which gives the field a soft focal point instead of looking like
     evenly-scattered noise. */
  const positions = new Float32Array(CONFIG.count * 3);
  const colors = new Float32Array(CONFIG.count * 3);
  const base = new THREE.Color();

  for (let i = 0; i < CONFIG.count; i++) {
    const x = (Math.random() - 0.5) * CONFIG.spread;
    const y = (Math.random() - 0.5) * CONFIG.spread;
    const z = (Math.random() - 0.5) * CONFIG.depth;
    positions.set([x, y, z], i * 3);

    const distance = Math.sqrt(x * x + y * y) / (CONFIG.spread * 0.5);
    const nearness = Math.max(0, 1 - distance);
    base.copy(accent).lerp(
      new THREE.Color(dark ? 0x8a8a8f : 0xb8b8bd),
      1 - nearness * 0.85
    );
    colors.set([base.r, base.g, base.b], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  material = new THREE.PointsMaterial({
    size: CONFIG.size,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    // Lower in light mode: dark dots on a near-white page are far more
    // visible than pale dots on black, so equal opacity is not equal presence.
    opacity: dark ? 0.8 : 0.42,
    depthWrite: false, // stops nearer particles punching holes in further ones
    // Additive blending makes overlaps glow on dark backgrounds. On light
    // backgrounds it washes out to white, so only use it in dark mode.
    blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Cap the pixel ratio. On a 3x phone screen, rendering at full density costs
  // triple the pixels for a difference nobody can see in a blurred backdrop.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);
}

function drawFrame() {
  // Ease the camera toward the pointer, so movement feels weighted rather
  // than snapping.
  pointer.x += (pointer.targetX - pointer.x) * 0.04;
  pointer.y += (pointer.targetY - pointer.y) * 0.04;
  camera.position.x = pointer.x * CONFIG.parallax;
  camera.position.y = pointer.y * CONFIG.parallax;
  camera.lookAt(0, 0, 0);

  points.rotation.y += CONFIG.rotation;

  /* Drift everything slowly upward, wrapping any particle that leaves the top
     back to the bottom. That keeps the field infinite without ever adding
     particles. */
  const pos = points.geometry.attributes.position;
  const half = CONFIG.spread / 2;
  for (let i = 1; i < pos.array.length; i += 3) {
    pos.array[i] += CONFIG.drift;
    if (pos.array[i] > half) pos.array[i] = -half;
  }
  pos.needsUpdate = true;

  renderer.render(scene, camera);
}

function render() {
  drawFrame();
  frame = requestAnimationFrame(render);
}

function start() {
  if (frame === null && renderer) frame = requestAnimationFrame(render);
}

function stop() {
  if (frame !== null) {
    cancelAnimationFrame(frame);
    frame = null;
  }
}

function resize() {
  if (!renderer || !container.clientWidth) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/* Only run while the landing page is the visible screen. Everywhere else the
   canvas is behind a hidden section, so animating it is pure waste. */
function landingVisible() {
  const landing = document.getElementById('screen-landing');
  return !!landing && !landing.hidden && !document.hidden;
}

function sync() {
  if (landingVisible()) start();
  else stop();
}

function init() {
  container = document.getElementById('void-field');
  if (!container) return;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  try {
    build();
  } catch (err) {
    // No WebGL, blocked GPU, out of contexts — a plain background is fine.
    console.warn('Void field unavailable:', err);
    return;
  }

  /* Paint a single frame straight away, before any loop starts. Without this,
     a page opened in a background tab shows an empty canvas until the moment
     you switch to it, because requestAnimationFrame doesn't run while hidden. */
  drawFrame();

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', sync);

  window.addEventListener('pointermove', function (event) {
    // Normalise to roughly -1..1 so the parallax is screen-size independent.
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.targetY = -((event.clientY / window.innerHeight) * 2 - 1);
  });

  // Repaint colours if the system flips between light and dark.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    const { dark } = themeColor();
    material.opacity = dark ? 0.8 : 0.42;
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    if (!frame) drawFrame(); // if the loop is paused, still show the new colours
  });

  sync();
}

// ui.js calls this whenever the screen changes.
window.VoidField = {
  sync: sync,
  drawFrame: function () { if (renderer) drawFrame(); },
  // Read-only: is the animation loop currently scheduled? Useful for checking
  // that the field really does stop when it isn't on screen.
  isRunning: function () { return frame !== null; },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
