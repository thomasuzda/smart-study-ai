/* ===========================================================================
   void-field.js — the particle hero behind the landing page

   Written from scratch with three.js, loaded from a CDN by the import map in
   index.html. No build step and no React.

   The look is inspired by particle-cloud hero scenes: a deep field of stars
   with luminous arcs sweeping through it, the whole thing leaning toward your
   cursor. It is our own implementation — nothing is copied from any paid
   template, whose source is deliberately not published.

   Three scene layers, drawn back to front:

     stars   thousands of small distant points, barely moving
     globe   a sphere of points whose upper arc sweeps across the hero, and
             which glows brightest near its equator
     dust    a few large, soft, close particles for depth

   Careful about the things a background running under text must get right:
   it stops when off-screen or in a background tab, it is skipped entirely for
   anyone who asked for reduced motion, and it fails quietly to a plain
   background if WebGL is unavailable.
   =========================================================================== */

import * as THREE from 'three';

const CONFIG = {
  stars: 2600,
  bust: 14000,   // enough that the silhouette reads as a continuous edge
  dust: 220,

  starSpread: 150,
  // Sunk so the shoulders run off the bottom of the frame, the way a bust
  // sits on a plinth — you see head, neck and the sweep of the shoulders.
  bustY: -6,

  rotation: 0.00035,
  parallax: 2.2,
  drift: 0.008,
};

let renderer, scene, camera, clock;
let stars, globe, dust;
let materials = [];
let frame = null;
let container = null;

const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

/* A soft round sprite. Untextured WebGL points are hard squares, which is the
   difference between "starfield" and "pixelated mess". */
function dotTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePoints(positions, colors, size, opacity, sprite) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: size,
    map: sprite,
    vertexColors: true,
    transparent: true,
    opacity: opacity,
    depthWrite: false, // stops near points punching holes in the ones behind
    blending: THREE.AdditiveBlending, // overlaps brighten, which is the glow
  });
  materials.push(material);
  return new THREE.Points(geometry, material);
}

function build() {
  const sprite = dotTexture();
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    62,
    container.clientWidth / container.clientHeight,
    0.1,
    600
  );
  camera.position.set(0, 1, 64);

  const accent = new THREE.Color(0x38bdf8); // luminous cyan
  const deep = new THREE.Color(0x1e40af);   // deeper blue for distance
  const white = new THREE.Color(0xffffff);
  const scratch = new THREE.Color();

  /* --- stars ------------------------------------------------------------ */
  const sp = new Float32Array(CONFIG.stars * 3);
  const sc = new Float32Array(CONFIG.stars * 3);
  for (let i = 0; i < CONFIG.stars; i++) {
    sp[i * 3] = (Math.random() - 0.5) * CONFIG.starSpread;
    sp[i * 3 + 1] = (Math.random() - 0.5) * CONFIG.starSpread * 0.7;
    sp[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.starSpread * 0.6 - 20;
    // Mostly white with a scattering of blue, so it reads as a night sky
    // rather than a uniform colour wash.
    scratch.copy(Math.random() > 0.82 ? accent : white)
      .multiplyScalar(0.35 + Math.random() * 0.65);
    sc.set([scratch.r, scratch.g, scratch.b], i * 3);
  }
  stars = makePoints(sp, sc, 0.34, 0.9, sprite);
  scene.add(stars);

  /* --- bust -------------------------------------------------------------
     A head, neck and shoulders built from three primitives and sampled as
     points. No model file to download, and it stays readable code.

     The glowing outline comes from rim lighting: each point knows which way
     the surface faces, and the shader brightens the ones whose surface is
     turning away from the camera. Those are exactly the points on the
     silhouette, so the edge blazes while the interior stays dim — which is
     what makes a cloud of dots read as a solid figure. */

  const bustPositions = [];
  const bustNormals = [];

  /* Sample an ellipsoid. Using acos on a uniform value spaces points evenly;
     a plain random angle bunches them at the poles. */
  function sampleEllipsoid(count, cx, cy, cz, rx, ry, rz, minY) {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 40) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);
      // Cropping the lower half of the shoulders is what turns a closed oval
      // into a shoulder line. Seen head-on, a full ellipsoid's rim reads as a
      // ring; only its top surface reads as a body.
      if (minY !== undefined && sy < minY) continue;
      placed++;
      bustPositions.push(cx + sx * rx, cy + sy * ry, cz + sz * rz);
      // Ellipsoid normal is the unit sphere point divided by the squared radii.
      const nx = sx / (rx * rx), ny = sy / (ry * ry), nz = sz / (rz * rz);
      const len = Math.hypot(nx, ny, nz) || 1;
      bustNormals.push(nx / len, ny / len, nz / len);
    }
  }

  /* Sample the side wall of a tapered cylinder — the neck. */
  function sampleTaper(count, cx, cy, cz, rTop, rBottom, height) {
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const r = rBottom + (rTop - rBottom) * t;
      const y = cy + (t - 0.5) * height;
      bustPositions.push(cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r * 0.85);
      bustNormals.push(Math.cos(angle), 0.12, Math.sin(angle));
    }
  }

  // Head — one egg-shaped mass. Kept as a single primitive on purpose: rim
  // lighting draws each shape's own outline, so a separate jaw or brow blob
  // shows up as a ring floating in mid-air rather than blending in.
  sampleEllipsoid(Math.round(CONFIG.bust * 0.40), 0, 15, 0, 8.0, 10.2, 8.6);
  // Neck — short and narrow, mostly hidden where head meets shoulders.
  sampleTaper(Math.round(CONFIG.bust * 0.06), 0, 3.5, 0, 4.0, 5.2, 7.0);
  // Shoulders — wide, and only the TOP surface, so they sweep off both edges
  // of the frame instead of closing into a ring.
  sampleEllipsoid(Math.round(CONFIG.bust * 0.54), 0, -11, 0, 26, 12, 9.5, -0.1);

  const bustGeometry = new THREE.BufferGeometry();
  bustGeometry.setAttribute(
    'position', new THREE.Float32BufferAttribute(bustPositions, 3));
  // Named aNormal because `normal` is a reserved built-in attribute name in
  // three.js shaders and would collide.
  bustGeometry.setAttribute(
    'aNormal', new THREE.Float32BufferAttribute(bustNormals, 3));

  const bustMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 2.7 },
      uDeep: { value: new THREE.Color(0x0b2a4a) },
      uAccent: { value: new THREE.Color(0x38bdf8) },
      uHot: { value: new THREE.Color(0xbdeaff) },
    },
    vertexShader: `
      attribute vec3 aNormal;
      uniform float uSize;
      varying float vRim;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * aNormal);
        vec3 viewDir = normalize(-mv.xyz);
        // 1 when the surface faces sideways (the silhouette), 0 when it faces
        // straight at us. This single number does all the work.
        vRim = 1.0 - abs(dot(n, viewDir));
        gl_PointSize = uSize * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uAccent;
      uniform vec3 uHot;
      varying float vRim;
      void main() {
        // Round off the square point and soften its edge.
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float soft = smoothstep(0.5, 0.05, d);

        float rim = pow(clamp(vRim, 0.0, 1.0), 2.2);
        vec3 colour = mix(uDeep, uAccent, rim);
        colour = mix(colour, uHot, pow(rim, 4.0) * 0.8);

        // Interior points stay faint so the outline dominates.
        float alpha = soft * (0.085 + rim * 0.8);
        gl_FragColor = vec4(colour, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(bustMaterial);

  globe = new THREE.Points(bustGeometry, bustMaterial);
  globe.position.y = CONFIG.bustY;
  scene.add(globe);

  /* --- dust ------------------------------------------------------------- */
  const dp = new Float32Array(CONFIG.dust * 3);
  const dc = new Float32Array(CONFIG.dust * 3);
  for (let i = 0; i < CONFIG.dust; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 90;
    dp[i * 3 + 1] = (Math.random() - 0.5) * 55;
    dp[i * 3 + 2] = 10 + Math.random() * 22; // in front, so they blur past
    scratch.copy(accent).multiplyScalar(0.35 + Math.random() * 0.4);
    dc.set([scratch.r, scratch.g, scratch.b], i * 3);
  }
  dust = makePoints(dp, dc, 1.5, 0.4, sprite);
  scene.add(dust);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  // Capping the pixel ratio matters here: on a 3x phone screen this scene
  // would otherwise render nine times the pixels for no visible gain.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  container.appendChild(renderer.domElement);

  clock = new THREE.Clock();
}

function drawFrame() {
  const t = clock ? clock.getElapsedTime() : 0;

  // Ease toward the pointer so movement feels weighted rather than snapping.
  pointer.x += (pointer.targetX - pointer.x) * 0.035;
  pointer.y += (pointer.targetY - pointer.y) * 0.035;
  camera.position.x = pointer.x * CONFIG.parallax;
  camera.position.y = pointer.y * CONFIG.parallax * 0.6;
  camera.lookAt(0, -2, 0);

  /* The bust turns to follow the pointer instead of spinning freely — a face
     that rotates away and comes back round reads as a novelty; one that looks
     toward you reads as attention. It drifts gently when the pointer is still. */
  const look = pointer.x * 0.55 + Math.sin(t * 0.18) * 0.06;
  const tilt = pointer.y * 0.18 + Math.sin(t * 0.13) * 0.02;
  globe.rotation.y += (look - globe.rotation.y) * 0.04;
  globe.rotation.x += (-tilt - globe.rotation.x) * 0.04;
  stars.rotation.y += CONFIG.rotation;

  // Drift the dust upward, wrapping it round so the field never empties.
  const pos = dust.geometry.attributes.position;
  for (let i = 1; i < pos.array.length; i += 3) {
    pos.array[i] += CONFIG.drift;
    if (pos.array[i] > 28) pos.array[i] = -28;
  }
  pos.needsUpdate = true;

  renderer.render(scene, camera);
}

function render() {
  drawFrame();
  frame = requestAnimationFrame(render);
}

function start() { if (frame === null && renderer) frame = requestAnimationFrame(render); }
function stop() { if (frame !== null) { cancelAnimationFrame(frame); frame = null; } }

function resize() {
  if (!renderer || !container.clientWidth) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function landingVisible() {
  const landing = document.getElementById('screen-landing');
  return !!landing && !landing.hidden && !document.hidden;
}

function sync() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (landingVisible()) start();
  else stop();
}

function init() {
  container = document.getElementById('void-field');
  if (!container) return;

  // Motion this large is exactly what the reduced-motion setting exists for.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('hero-static');
    return;
  }

  try {
    build();
  } catch (err) {
    console.warn('Hero scene unavailable:', err);
    document.body.classList.add('hero-static');
    return;
  }

  // Paint one frame before any loop starts, so a page opened in a background
  // tab is never blank — requestAnimationFrame does not run while hidden.
  drawFrame();

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pointermove', function (event) {
    pointer.targetX = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.targetY = -((event.clientY / window.innerHeight) * 2 - 1);
  });

  if (!document.hidden) start();
}

window.VoidField = {
  sync: sync,
  drawFrame: function () { if (renderer) drawFrame(); },
  isRunning: function () { return frame !== null; },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
