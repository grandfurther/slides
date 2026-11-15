/* X-ray Mirror — webcam face/hand tracking with an anatomy overlay.
   Runs fully in the browser: MediaPipe (tracking) + three.js (rendering).
   Anatomy models: BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan. */
(() => {
'use strict';
const THREE = window.THREE;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- assets
const DEV_PATHS = {
  anatomy: '../assets/anatomy.bin',
  wasm: '../vendor/vision_wasm_internal.wasm',
  wasmjs: '../vendor/vision_wasm_internal.js',
  face: '../vendor/face_landmarker.task',
  hand: '../vendor/hand_landmarker.task',
};
async function asset(name) {
  const el = $('asset-' + name);
  if (!el) return new Uint8Array(await (await fetch(DEV_PATHS[name])).arrayBuffer());
  const s = atob(el.textContent.trim());
  el.textContent = '';
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const blobUrl = (u8, type) => URL.createObjectURL(new Blob([u8], { type }));

// ---------------------------------------------------------------- settings
const DEFAULTS = {
  layers: { skull: true, brain: true, muscles: true, eyes: true, outline: true, hand: true },
  labels: true, mirror: true, debug: false,
  size: 100, width: 100, height: 100, glow: 100,
};
let cfg = JSON.parse(JSON.stringify(DEFAULTS));
try {
  const saved = JSON.parse(localStorage.getItem('xray-mirror') || 'null');
  if (saved) cfg = Object.assign(cfg, saved, { layers: Object.assign(cfg.layers, saved.layers) });
} catch (e) { /* storage unavailable: defaults */ }
const save = () => { try { localStorage.setItem('xray-mirror', JSON.stringify(cfg)); } catch (e) {} };

// ---------------------------------------------------------------- math
// Best-fit similarity transform (Horn's quaternion method): dst ≈ s·R·src + t
function fitSimilarity(src, dst) {
  const n = src.length;
  let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    ax += src[i][0]; ay += src[i][1]; az += src[i][2];
    bx += dst[i].x; by += dst[i].y; bz += dst[i].z;
  }
  ax /= n; ay /= n; az /= n; bx /= n; by /= n; bz /= n;
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0, aa = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - ax, y = src[i][1] - ay, z = src[i][2] - az;
    const u = dst[i].x - bx, v = dst[i].y - by, w = dst[i].z - bz;
    Sxx += x * u; Sxy += x * v; Sxz += x * w;
    Syx += y * u; Syy += y * v; Syz += y * w;
    Szx += z * u; Szy += z * v; Szz += z * w;
    aa += x * x + y * y + z * z;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  // Jacobi eigen-decomposition of the symmetric 4x4
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) off += N[p][q] * N[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(N[p][q]) < 1e-30) continue;
      const th = (N[q][q] - N[p][p]) / (2 * N[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) {
        const kp = N[k][p], kq = N[k][q];
        N[k][p] = c * kp - s * kq; N[k][q] = s * kp + c * kq;
      }
      for (let k = 0; k < 4; k++) {
        const pk = N[p][k], qk = N[q][k];
        N[p][k] = c * pk - s * qk; N[q][k] = s * pk + c * qk;
      }
      for (let k = 0; k < 4; k++) {
        const kp = V[k][p], kq = V[k][q];
        V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq;
      }
    }
  }
  let m = 0;
  for (let i = 1; i < 4; i++) if (N[i][i] > N[m][m]) m = i;
  const q = new THREE.Quaternion(V[1][m], V[2][m], V[3][m], V[0][m]).normalize();
  const scale = N[m][m] / aa;
  const c = new THREE.Vector3(ax, ay, az).applyQuaternion(q).multiplyScalar(scale);
  const pos = new THREE.Vector3(bx - c.x, by - c.y, bz - c.z);
  // residual
  let err = 0; const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set(src[i][0], src[i][1], src[i][2]).applyQuaternion(q).multiplyScalar(scale).add(pos);
    err += p.distanceToSquared(dst[i]);
  }
  return { q, scale, pos, err: Math.sqrt(err / n) };
}

// One-euro filter over a flat array of numbers (removes jitter, keeps fast motion responsive)
class Smoother {
  constructor(minCut = 1.6, beta = 0.035) { this.minCut = minCut; this.beta = beta; this.x = null; this.dx = null; this.t = 0; }
  reset() { this.x = null; }
  run(vals, t) {
    if (!this.x || this.x.length !== vals.length || t - this.t > 0.4) {
      this.x = Float64Array.from(vals); this.dx = new Float64Array(vals.length); this.t = t; return this.x;
    }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const ad = 1 / (1 + 1 / (2 * Math.PI * 1.0 * dt));
    for (let i = 0; i < vals.length; i++) {
      const d = (vals[i] - this.x[i]) / dt;
      this.dx[i] += ad * (d - this.dx[i]);
      const cut = this.minCut + this.beta * Math.abs(this.dx[i]);
      const a = 1 / (1 + 1 / (2 * Math.PI * cut * dt));
      this.x[i] += a * (vals[i] - this.x[i]);
    }
    return this.x;
  }
}

// ---------------------------------------------------------------- rendering setup
const stage = $('stage'), video = $('video'), glCanvas = $('gl'), ov = $('overlay');
const ctx = ov.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, premultipliedAlpha: true });
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
let W = 1, H = 1, dpr = 1;
// video placement inside the stage ("cover")
const view = { s: 1, ox: 0, oy: 0, vw: 1, vh: 1 };

function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
  camera.right = W; camera.bottom = -H; camera.updateProjectionMatrix();
  view.vw = video.videoWidth || 1280; view.vh = video.videoHeight || 720;
  view.s = Math.max(W / view.vw, H / view.vh);
  view.ox = (W - view.vw * view.s) / 2; view.oy = (H - view.vh * view.s) / 2;
  video.style.width = view.vw + 'px'; video.style.height = view.vh + 'px';
  video.style.transform = cfg.mirror
    ? `translate(${view.ox + view.vw * view.s}px,${view.oy}px) scale(${-view.s},${view.s})`
    : `translate(${view.ox}px,${view.oy}px) scale(${view.s})`;
}
window.addEventListener('resize', layout);

// base: glow facing the camera · rim: extra glow on grazing surfaces · occ: how much the layer hides the video
// xray: no depth pre-pass, so every surface adds up (bone looks see-through); otherwise only the nearest surface draws
const LAYER_STYLE = {
  dim:     { flat: true, color: 0x02060c, occ: 0.44, fadeY: -13.5 },
  outline: { color: 0x3f86ff, base: 0.0, rim: 1.0, power: 3.2, occ: 0.3, fadeY: -13.5 },
  brain:   { color: 0xff86b4, base: 0.07, rim: 0.95, power: 1.15, occ: 0.5 },
  muscles: { color: 0xff5f3c, base: 0.07, rim: 0.9, power: 1.0, occ: 0.5 },
  eyes:    { color: 0xffe08a, base: 0.1, rim: 0.75, power: 1.3, occ: 0.4 },
  skull:   { color: 0xd4e8ff, base: 0.03, rim: 0.5, power: 2.0, occ: 0.45, xray: true },
  hand:    { color: 0xe4f1ff, base: 0.1, rim: 0.85, power: 1.4, occ: 0.6, xray: true },
};
const LAYER_ORDER = ['dim', 'outline', 'brain', 'muscles', 'eyes', 'skull', 'hand'];
const glow = { value: 1 };
function makeMaterials(style) {
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const color = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(style.color) }, uBase: { value: style.base || 0 }, uRim: { value: style.rim || 0 },
                uPower: { value: style.power || 1 }, uGlow: style.flat ? { value: 1 } : glow, uOcc: { value: style.occ }, uFlat: { value: style.flat ? 1 : 0 }, uFadeY: { value: style.fadeY === undefined ? -1000 : style.fadeY } },
    vertexShader: `varying vec3 vN; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uBase,uRim,uPower,uGlow,uOcc,uFlat,uFadeY; varying vec3 vN; varying float vY;
      void main(){ float f = 1.0 - abs(normalize(vN).z); float a = clamp((uBase + uRim * pow(f, uPower)) * uGlow, 0.0, 1.0);
        float k = smoothstep(uFadeY, uFadeY + 3.5, vY);   // fade out below the jaw (head-model centimetres)
        gl_FragColor = (uFlat > 0.5 ? vec4(uColor * uOcc, uOcc) : vec4(uColor * a, a * uOcc)) * k; }`,
    transparent: true, depthWrite: false, depthTest: !style.xray, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return { depth, color };
}
const mats = {}; for (const k of LAYER_ORDER) mats[k] = makeMaterials(LAYER_STYLE[k]);
// each layer: [{depthMesh, colorMesh}] — drawn as depth pre-pass then colour, so only the nearest surface of a layer glows
const layerObjs = {}; for (const k of LAYER_ORDER) layerObjs[k] = [];

// ---------------------------------------------------------------- anatomy
let A = null;               // header from anatomy.bin
const head = new THREE.Group(), headFit = new THREE.Group(), jaw = new THREE.Group();
head.matrixAutoUpdate = false; head.visible = false;
scene.add(head); head.add(headFit); headFit.add(jaw);
const hands = [];           // [{group, carpals, bones:[obj], seen}]
const HEAD_CENTER = new THREE.Vector3(0, 1.5, -5.5);  // canonical cm, roughly the middle of the head

function buildGeometry(m, buf) {
  const q = new Uint16Array(buf, m.pos, m.nv * 3);
  const pos = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv; i++) for (let k = 0; k < 3; k++)
    pos[i * 3 + k] = m.lo[k] + (q[i * 3 + k] / 65535) * (m.hi[k] - m.lo[k]);
  const idx = m.u32 ? new Uint32Array(buf, m.idx, m.ni) : new Uint16Array(buf, m.idx, m.ni);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
function addLayerMesh(layer, geom, parent) {
  const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
  const d = new THREE.Mesh(geom, mats[layer].depth), c = new THREE.Mesh(geom, mats[layer].color);
  d.frustumCulled = c.frustumCulled = false; d.renderOrder = 0; c.renderOrder = 1;
  if (LAYER_STYLE[layer].xray) holder.add(c); else holder.add(d, c);
  parent.add(holder);
  layerObjs[layer].push(holder);
  return holder;
}
function loadAnatomy(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hl = dv.getUint32(0, true);
  A = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + hl)));
  const buf = u8.buffer.slice(u8.byteOffset + 4 + hl, u8.byteOffset + u8.byteLength);
  const geoms = A.meshes.map((m) => buildGeometry(m, buf));
  A.meshes.forEach((m, i) => {
    if (m.layer === 'hand') return;
    addLayerMesh(m.layer, geoms[i], m.group === 'jaw' ? jaw : headFit);
    if (m.layer === 'outline') addLayerMesh('dim', geoms[i], headFit);   // darkens the head so the glow reads on bright skin
  });
  for (let h = 0; h < 2; h++) {
    const group = new THREE.Group(); group.visible = false; scene.add(group);
    const carpals = addLayerMesh('hand', geoms[A.hand.carpals], group);
    const bones = A.hand.bones.map((b) => addLayerMesh('hand', geoms[b.mesh], group));
    hands.push({ group, carpals, bones, smooth: new Smoother(2.2, 0.05), pts: null, labels: null });
  }
  jaw.userData.pivot = new THREE.Vector3().fromArray(A.jaw.pivot);
}

// ---------------------------------------------------------------- tracking -> scene
// Landmarks that barely move with expression: forehead, nose bridge, eye corners, cheekbones, temples
const RIGID = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 67, 109, 338, 297, 33, 133, 362, 263, 116, 345, 123, 352,
               234, 454, 127, 356, 21, 251, 54, 284, 162, 389, 129, 358, 98, 327, 70, 300, 105, 334];
const faceSmooth = new Smoother(1.4, 0.03);
const jawSmooth = new Smoother(3.0, 0.2);
let facePts = null, faceSeenAt = -1, headState = null;

function lmToPx(lm, out) {
  const u = cfg.mirror ? 1 - lm.x : lm.x;
  out.set(view.ox + u * view.vw * view.s, -(view.oy + lm.y * view.vh * view.s), -lm.z * view.vw * view.s);
  return out;
}
function smoothPoints(sm, lms, t) {
  const flat = new Float64Array(lms.length * 3); const v = new THREE.Vector3();
  for (let i = 0; i < lms.length; i++) { lmToPx(lms[i], v); flat[i * 3] = v.x; flat[i * 3 + 1] = v.y; flat[i * 3 + 2] = v.z; }
  const s = sm.run(flat, t); const pts = [];
  for (let i = 0; i < lms.length; i++) pts.push(new THREE.Vector3(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]));
  return pts;
}

function updateHead(lms, t) {
  facePts = smoothPoints(faceSmooth, lms, t);
  // a mirrored image shows a mirrored head, so fit (and draw) the mirrored model
  const mx = cfg.mirror ? -1 : 1;
  const src = RIGID.map((i) => [A.canon[i][0] * mx, A.canon[i][1], A.canon[i][2]]), dst = RIGID.map((i) => facePts[i]);
  const f = fitSimilarity(src, dst);
  head.matrix.compose(f.pos, f.q, new THREE.Vector3(f.scale * mx, f.scale, f.scale));
  head.matrixWorldNeedsUpdate = true;
  // jaw: inner-lip gap, measured in model centimetres, drives the hinge at the jaw joint
  const gap = facePts[13].distanceTo(facePts[14]) / f.scale;
  const ang = jawSmooth.run([Math.min(0.5, Math.max(0, (gap - 0.25) / 8.5))], t)[0];
  const p = jaw.userData.pivot;
  jaw.matrixAutoUpdate = false;
  jaw.matrix.makeTranslation(p.x, p.y, p.z)
    .multiply(new THREE.Matrix4().makeRotationX(ang))
    .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  headState = f; faceSeenAt = t; head.visible = true;
}
function applyFit() {
  const s = cfg.size / 100, c = HEAD_CENTER;
  headFit.matrixAutoUpdate = false;
  headFit.matrix.makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeScale(s * cfg.width / 100, s * cfg.height / 100, s))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function updateHand(h, lms, t) {
  const pts = h.pts = smoothPoints(h.smooth, lms, t);
  const ref = A.hand.ref, dst = ref.lm.map((i) => pts[i]);
  const fitA = fitSimilarity(ref.pts, dst);
  const fitB = fitSimilarity(ref.pts.map((p) => [-p[0], p[1], p[2]]), dst);
  const chir = fitB.err < fitA.err ? -1 : 1, f = chir < 0 ? fitB : fitA;
  const palm = new THREE.Matrix4().compose(f.pos, f.q, new THREE.Vector3(f.scale * chir, f.scale, f.scale));
  h.carpals.matrix.copy(palm);
  const dir = (v) => new THREE.Vector3(v[0] * chir, v[1], v[2]).applyQuaternion(f.q);
  const lateral = dir(A.hand.lateral), normal = dir(A.hand.normal);
  A.hand.bones.forEach((b, i) => {
    const a = b.a < 0 ? new THREE.Vector3().fromArray(b.base).applyMatrix4(palm) : pts[b.a].clone();
    const e = pts[b.b];
    _y.subVectors(e, a);
    const full = _y.length(); if (full < 1e-3) return;
    _y.divideScalar(full);
    const len = full * b.shrink;
    if (b.kind !== 'dist' && b.kind !== 'meta') a.addScaledVector(_y, (full - len) / 2);
    if (b.finger === 0) {
      _z.copy(normal).addScaledVector(_y, -normal.dot(_y)).normalize();
      _x.crossVectors(_y, _z).multiplyScalar(chir);
    } else {
      _x.copy(lateral).addScaledVector(_y, -lateral.dot(_y)).normalize();
      _z.crossVectors(_x, _y).multiplyScalar(chir);
    }
    _m.makeBasis(_x.multiplyScalar(len), _y.clone().multiplyScalar(len), _z.multiplyScalar(len)).setPosition(a);
    h.bones[i].matrix.copy(_m);
  });
  h.group.visible = true; h.seenAt = t;
}

// ---------------------------------------------------------------- labels + overlay
const labelY = new Map();
function drawLabels(t) {
  const items = [];
  if (head.visible && headState) {
    head.updateMatrixWorld(true);
    const c = HEAD_CENTER.clone().applyMatrix4(headFit.matrixWorld);
    const R = headState.scale * 11.5 * (cfg.size / 100);
    const v = new THREE.Vector3(); let pairN = 0;
    for (const L of A.labels) {
      if (!cfg.layers[L.layer]) continue;
      const mw = (L.group === 'jaw' ? jaw : headFit).matrixWorld;
      // structures that exist on both sides alternate left / right so the two label columns stay balanced
      let best = null, side = 0;
      if (L.pts.length > 1) {
        side = (pairN++ % 2) ? 1 : -1;
        for (const p of L.pts) { v.fromArray(p).applyMatrix4(mw); if (!best || (v.x - best.x) * side > 0) best = v.clone(); }
      } else best = v.fromArray(L.pts[0]).applyMatrix4(mw).clone();
      items.push({ key: L.text, text: L.text, x: best.x, y: -best.y, cx: c.x, cy: -c.y, R, layer: L.layer, side });
    }
    // ring around the head
    ctx.beginPath(); ctx.arc(c.x, -c.y, R * 1.12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(190,215,255,.28)'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (cfg.layers.hand) hands.forEach((h, hi) => {
    if (!h.group.visible || !h.pts) return;
    const p = h.pts, mid = (a, b) => ({ x: (p[a].x + p[b].x) / 2, y: -(p[a].y + p[b].y) / 2 });
    let cx = 0, cy = 0, R = 0; for (const q of p) { cx += q.x; cy -= q.y; } cx /= p.length; cy /= p.length;
    for (const q of p) R = Math.max(R, Math.hypot(q.x - cx, -q.y - cy));
    const side = headState && head.visible ? (cx < HEAD_CENTER.clone().applyMatrix4(headFit.matrixWorld).x ? -1 : 1) : (cx < W / 2 ? -1 : 1);
    [['Distal phalanx', mid(7, 8)], ['Middle phalanx', mid(6, 7)], ['Proximal phalanx', mid(5, 6)], ['Metacarpal', mid(0, 9)]]
      .forEach(([text, a]) => items.push({ key: text + hi, text, x: a.x, y: a.y, cx, cy, R: R * 0.95, layer: 'hand', side }));
  });
  // lay out: text columns left and right of each cluster, spaced so they never overlap
  const gapY = 15, groups = new Map();
  for (const it of items) {
    it.side = it.side || (it.x < it.cx ? -1 : 1);
    const k = it.layer === 'hand' ? it.key.slice(-1) + it.side : 'h' + it.side;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  ctx.font = '11px system-ui,-apple-system,"Segoe UI",sans-serif'; ctx.textBaseline = 'middle';
  for (const g of groups.values()) {
    // smooth each label's own height first, then space the column, so labels never overlap while they settle
    for (const it of g) {
      const prev = labelY.get(it.key);
      it.sy = prev === undefined || Math.abs(prev - it.y) > 80 ? it.y : prev + (it.y - prev) * 0.3;
      labelY.set(it.key, it.sy);
    }
    g.sort((a, b) => a.sy - b.sy);
    g[0].ty = g[0].sy;
    for (let i = 1; i < g.length; i++) g[i].ty = Math.max(g[i].sy, g[i - 1].ty + gapY);
    const shift = (g[g.length - 1].ty - g[g.length - 1].sy) / 2;
    for (const it of g) {
      const y = it.ty - shift;
      const tx = it.cx + it.side * (it.R * 1.12 + 26);
      ctx.strokeStyle = 'rgba(225,238,255,.55)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(tx - it.side * 14, y); ctx.lineTo(tx - it.side * 4, y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(it.x, it.y, 1.8, 0, 6.3); ctx.fill();
      ctx.textAlign = it.side < 0 ? 'right' : 'left';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(240,247,255,.96)'; ctx.fillText(it.text, tx, y);
      ctx.shadowBlur = 0;
    }
  }
}
const HAND_EDGES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function drawDebug() {
  if (facePts && head.visible) {
    ctx.fillStyle = 'rgba(120,255,190,.8)';
    for (const p of facePts) ctx.fillRect(p.x - 0.8, -p.y - 0.8, 1.6, 1.6);
  }
  ctx.strokeStyle = 'rgba(255,220,120,.9)'; ctx.lineWidth = 1.2;
  for (const h of hands) if (h.group.visible && h.pts) {
    ctx.beginPath();
    for (const [a, b] of HAND_EDGES) { ctx.moveTo(h.pts[a].x, -h.pts[a].y); ctx.lineTo(h.pts[b].x, -h.pts[b].y); }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- main loop
let faceLm = null, handLm = null, running = false, lastVideoTime = -1, fps = 0, lastTick = 0, trackMs = 0;
function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const now = performance.now(), t = now / 1000;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    if (view.vw !== video.videoWidth) layout();
    const t0 = performance.now();
    try {
      const fr = faceLm.detectForVideo(video, now);
      if (fr.faceLandmarks && fr.faceLandmarks.length) updateHead(fr.faceLandmarks[0], t);
      if (cfg.layers.hand) {
        const hr = handLm.detectForVideo(video, now);
        const found = hr.landmarks || [];
        // keep each detected hand on the same slot from frame to frame
        const used = [false, false];
        found.slice(0, 2).forEach((lms) => {
          const w = lmToPx(lms[9], new THREE.Vector3());
          let slot = -1, best = 1e9;
          hands.forEach((h, i) => { if (!used[i] && h.pts && h.group.visible) { const d = h.pts[9].distanceTo(w); if (d < best && d < W * 0.3) { best = d; slot = i; } } });
          if (slot < 0) slot = used[0] ? 1 : (hands[0].group.visible && !used[1] ? 1 : 0);
          if (used[slot]) return;
          used[slot] = true; updateHand(hands[slot], lms, t);
        });
        hands.forEach((h, i) => { if (!used[i] && t - (h.seenAt || 0) > 0.15) { h.group.visible = false; h.smooth.reset(); } });
      } else hands.forEach((h) => { h.group.visible = false; });
    } catch (e) { console.error(e); }
    trackMs += (performance.now() - t0 - trackMs) * 0.1;
    fps += (1000 / Math.max(1, now - lastTick) - fps) * 0.1; lastTick = now;
  }
  if (head.visible && t - faceSeenAt > 0.3) { head.visible = false; faceSmooth.reset(); }

  // draw: one pass per layer so layers add up like an X-ray while each stays readable
  // with several layers stacked, turn each one down a little so the picture does not wash out
  const stacked = (cfg.layers.skull ? 1 : 0) + (cfg.layers.brain ? 1 : 0) + (cfg.layers.muscles ? 1 : 0);
  glow.value = (cfg.glow / 100) * [1, 1, 0.78, 0.62][stacked];
  renderer.clear();
  const any = (head.visible || hands.some((h) => h.group.visible));
  if (any) {
    for (const k of LAYER_ORDER) for (const o of layerObjs[k]) o.visible = false;
    for (const k of LAYER_ORDER) {
      if (!(k === 'dim' ? head.visible && (cfg.layers.skull || cfg.layers.brain || cfg.layers.muscles) : cfg.layers[k])) continue;
      for (const o of layerObjs[k]) o.visible = true;
      renderer.clearDepth(); renderer.render(scene, camera);
      for (const o of layerObjs[k]) o.visible = false;
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (cfg.labels) drawLabels(t);
  if (cfg.debug) {
    drawDebug();
    $('hud').textContent = `${fps.toFixed(0)} fps · tracking ${trackMs.toFixed(0)} ms · ${video.videoWidth}×${video.videoHeight}` +
      `\nface ${head.visible ? 'locked' : 'searching'} · hands ${hands.filter((h) => h.group.visible).length}`;
  }
}

// ---------------------------------------------------------------- camera + start-up
let stream = null;
async function openCamera(deviceId) {
  if (stream) stream.getTracks().forEach((tr) => tr.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  video.srcObject = stream; await video.play(); layout();
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  const cur = stream.getVideoTracks()[0].getSettings().deviceId, sel = $('camSel');
  sel.textContent = '';
  cams.forEach((c, i) => { const o = document.createElement('option'); o.value = c.deviceId; o.textContent = c.label || `Camera ${i + 1}`; o.selected = c.deviceId === cur; sel.append(o); });
  sel.hidden = cams.length < 2;
}
async function createTrackers() {
  const V = window.MPVision;
  const fileset = { wasmLoaderPath: blobUrl(await asset('wasmjs'), 'text/javascript'), wasmBinaryPath: blobUrl(await asset('wasm'), 'application/wasm') };
  const faceModel = await asset('face'), handModel = await asset('hand');
  const make = async (delegate) => {
    const f = await V.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: faceModel.slice(), delegate }, runningMode: 'VIDEO', numFaces: 1 });
    const h = await V.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: handModel.slice(), delegate }, runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    return [f, h];
  };
  try { [faceLm, handLm] = await make('GPU'); }
  catch (e) { console.warn('GPU tracking unavailable, using CPU', e); [faceLm, handLm] = await make('CPU'); }
}
let ready = null;
async function start() {
  const btn = $('startBtn'), msg = $('startMsg');
  btn.disabled = true; msg.className = '';
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot open a camera from this page. Try Chrome or Edge.');
    msg.textContent = 'Waiting for camera permission…';
    await openCamera();
    msg.textContent = 'Loading anatomy and tracking models…';
    await (ready = ready || (async () => { loadAnatomy(await asset('anatomy')); applyFit(); await createTrackers(); })());
    $('start').hidden = true; $('dock').hidden = false;
    running = true; layout(); requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    msg.className = 'err';
    msg.textContent = e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this page in your browser, then press Start again.'
      : e && e.name === 'NotFoundError' ? 'No camera was found. Plug one in, then press Start again.'
      : 'Could not start: ' + (e && e.message || e);
    btn.disabled = false; ready = null;
  }
}

// ---------------------------------------------------------------- controls
function syncUI() {
  for (const k of Object.keys(DEFAULTS.layers)) $('L-' + k).checked = cfg.layers[k];
  $('O-labels').checked = cfg.labels; $('O-mirror').checked = cfg.mirror; $('O-debug').checked = cfg.debug;
  for (const k of ['size', 'width', 'height', 'glow']) { const el = $('F-' + k); el.value = cfg[k]; el.previousElementSibling.textContent = cfg[k] + '%'; }
  $('hud').hidden = !cfg.debug;
}
for (const k of Object.keys(DEFAULTS.layers)) $('L-' + k).addEventListener('change', (e) => { cfg.layers[k] = e.target.checked; save(); });
for (const k of ['size', 'width', 'height', 'glow']) $('F-' + k).addEventListener('input', (e) => { cfg[k] = +e.target.value; applyFit(); syncUI(); save(); });
$('O-labels').addEventListener('change', (e) => { cfg.labels = e.target.checked; save(); });
$('O-debug').addEventListener('change', (e) => { cfg.debug = e.target.checked; syncUI(); save(); });
$('O-mirror').addEventListener('change', (e) => { cfg.mirror = e.target.checked; faceSmooth.reset(); hands.forEach((h) => h.smooth.reset()); layout(); save(); });
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = b.dataset.preset, L = cfg.layers;
  L.skull = p === 'skull' || p === 'all'; L.brain = p === 'brain' || p === 'all'; L.muscles = p === 'muscles' || p === 'all';
  L.eyes = p !== 'skull'; L.outline = true; L.hand = true;
  syncUI(); save();
}));
$('resetBtn').addEventListener('click', () => { for (const k of ['size', 'width', 'height', 'glow']) cfg[k] = DEFAULTS[k]; applyFit(); syncUI(); save(); });
$('camSel').addEventListener('change', (e) => openCamera(e.target.value).catch(console.error));
$('startBtn').addEventListener('click', start);
$('helpBtn').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
const toggleClean = () => document.body.classList.toggle('clean');
const toggleFs = () => { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); };
$('hideBtn').addEventListener('click', toggleClean);
$('fsBtn').addEventListener('click', toggleFs);
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'h' || e.key === 'H') toggleClean();
  if (e.key === 'f' || e.key === 'F') toggleFs();
});
stage.addEventListener('dblclick', toggleClean);
window.__xray = { head, headFit, jaw, hands, cfg, get state() { return headState; }, get A() { return A; }, get facePts() { return facePts; } };
syncUI(); layout();
})();
