// The handset is modelled here, not filmed: front glass, slim metal frame,
// matte back and a large round camera assembly. All proportions live in
// DEVICE so the model can be re-tuned against the reference mockup in one place.
//
// The HTML phone screen is the source of truth for layout. The 3D camera is
// fitted to it every resize, so the live controls sit exactly on the glass and
// stay ordinary, still DOM while someone is using them.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const DEVICE = {
  W: 74, H: 160.5, T: 8.4, // body, mm
  R: 13.5,                 // body corner radius
  frame: 1.5,              // visible metal frame width
  bezel: 2.3,              // body edge to active screen
  screenR: 11.4,           // screen corner radius
  cam: { y: 42, r: 20.5 }, // camera ring: distance from top edge, outer radius
};
export const SCREEN_W = DEVICE.W - DEVICE.bezel * 2;
export const SCREEN_H = DEVICE.H - DEVICE.bezel * 2;

const FOV = 22;
const CAM_D = 1200;
const GAP = DEVICE.W * 1.12; // spacing between exploded planes
export const LAYER_Z = (i, e) => (1.5 - i) * GAP * e;

function rr(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function buildPhone(mats) {
  const { W, H, T, R, frame, bezel, screenR, cam } = DEVICE;
  const g = new THREE.Group();
  const b = 1.15; // edge rounding of the frame

  // Metal frame: a rounded ring, bevelled front and back.
  const outer = rr(W - b * 2, H - b * 2, R - b);
  const hole = rr(W - frame * 2 - b * 0.4, H - frame * 2 - b * 0.4, R - frame);
  outer.holes.push(new THREE.Path(hole.getPoints(24).reverse()));
  const frameGeo = new THREE.ExtrudeGeometry(outer, {
    depth: T - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments: 28,
  });
  frameGeo.translate(0, 0, -T + b);
  g.add(new THREE.Mesh(frameGeo, mats.metal));

  // Back panel (faces -z).
  const back = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - frame * 2, H - frame * 2, R - frame), 28), mats.back);
  back.rotation.y = Math.PI; back.position.z = -T + 0.25;
  g.add(back);

  // Front glass and the active display area.
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - frame * 1.6, H - frame * 1.6, R - frame * 0.8), 28), mats.glass);
  glass.position.z = -0.2;
  g.add(glass);
  const screen = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - bezel * 2, H - bezel * 2, screenR), 24), mats.screen);
  screen.position.z = -0.08;
  g.add(screen);

  // Side keys.
  const key = (x, y, len) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, len, 2.4), mats.metal);
    m.position.set(x, y, -T / 2); g.add(m);
  };
  key(W / 2 + 0.1, 22, 15);
  key(-W / 2 - 0.1, 30, 11); key(-W / 2 - 0.1, 15, 11);

  // Round rear camera assembly.
  const camG = new THREE.Group();
  camG.position.set(0, H / 2 - cam.y, -T);
  camG.rotation.y = Math.PI; // local +z now points out of the back
  const ring = new THREE.Mesh(new THREE.TorusGeometry(cam.r - 0.9, 0.95, 20, 96), mats.ring);
  ring.position.z = 1.9;
  const cyl = (r, hgt, mat, z, seg = 64) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, seg), mat);
    m.rotation.x = Math.PI / 2; m.position.z = z; return m;
  };
  camG.add(ring, cyl(cam.r - 0.9, 1.9, mats.metalDark, 0.95), cyl(cam.r - 1.5, 0.3, mats.glass, 2.0));
  [[-7.6, 0.4], [5.4, 8.4], [6.0, -7.6]].forEach(([x, y]) => {
    const lens = new THREE.Group();
    lens.position.set(x, y, 2.1);
    lens.add(cyl(6.7, 0.9, mats.metalDark, 0.45), cyl(5.5, 0.5, mats.lens, 0.95), cyl(3.5, 0.12, mats.metalDark, 1.24, 48), cyl(1.7, 0.12, mats.iris, 1.3, 32));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.3, 12, 64), mats.lensRing);
    lip.position.z = 0.95; lens.add(lip);
    camG.add(lens);
  });
  const flash = cyl(1.5, 0.3, mats.flash, 2.2, 24); flash.position.x = -9; flash.position.y = 12.5; camG.add(flash);
  g.add(camG);
  return g;
}

export function createStage({ canvas, stageEl, screenEl, grabEl, planeEls = [], labelEls = [], onRest, reducedMotion }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (err) {
    return { ok: false };
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 50, 6000);
  camera.position.set(0, 0, CAM_D);

  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-500, 600, 900);
  const rim = new THREE.DirectionalLight(0xc4d6e6, 1.1); rim.position.set(700, 300, -500);
  const glow = new THREE.PointLight(0x7fb2e0, 0.5, 0, 0); glow.position.set(0, -120, -40);
  scene.add(key, rim, glow);

  const css = getComputedStyle(document.documentElement);
  const screenColor = new THREE.Color(css.getPropertyValue('--screen-bg').trim() || '#0b0d10');
  const mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 1, roughness: 0.34 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.9, roughness: 0.38 }),
    ring: new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: 1, roughness: 0.2 }),
    lensRing: new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 1, roughness: 0.3 }),
    back: new THREE.MeshPhysicalMaterial({ color: 0x0d0f13, metalness: 0.3, roughness: 0.66, sheen: 0.25, sheenRoughness: 0.7, sheenColor: 0x2c3540 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x040506, metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x070b14, metalness: 0.2, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x0a1630, emissive: 0x0f2a55, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.15 }),
    flash: new THREE.MeshStandardMaterial({ color: 0xd9d4c4, roughness: 0.5 }),
    screen: new THREE.MeshBasicMaterial({ color: screenColor, toneMapped: false }),
  };

  const front = new THREE.Group();
  const frontBody = buildPhone(mats);
  front.add(frontBody);
  const anchors = labelEls.map(() => { const o = new THREE.Object3D(); front.add(o); return o; });
  const rear = new THREE.Group();
  rear.add(buildPhone(mats));
  scene.add(rear, front);

  const st = {
    yaw: 0, pitch: 0, yawT: 0, pitchT: 0, flipped: false, dragging: false,
    e: 0, eT: 0, step: -1,
    rearOn: true, rearK: 1,
    k: 1, s: 1, w: 0, h: 0, cx: 0, cy: 0, rest: null,
    pose: null,
  };
  let raf = 0, last = 0;
  const invalidate = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function resize() {
    const sr = stageEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(sr.width)), h = Math.max(1, Math.round(sr.height));
    // offsetLeft/Top ignore transforms, so this is the resting rect.
    const cx = screenEl.offsetLeft + screenEl.offsetWidth / 2;
    const cy = screenEl.offsetTop + screenEl.offsetHeight / 2;
    const P = h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    Object.assign(st, { w, h, cx, cy, k: P / CAM_D, s: screenEl.offsetHeight / (SCREEN_H * (P / CAM_D)) });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Shift the principal point onto the phone so it is seen dead straight on.
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    camera.updateProjectionMatrix();
    stageEl.style.perspective = `${P}px`;
    stageEl.style.perspectiveOrigin = `${cx}px ${cy}px`;
    if (grabEl) {
      const pad = 26, pw = DEVICE.W * st.s * st.k, ph = DEVICE.H * st.s * st.k;
      Object.assign(grabEl.style, { left: `${cx - pw / 2 - pad}px`, top: `${cy - ph / 2 - pad}px`, width: `${pw + pad * 2}px`, height: `${ph + pad * 2}px` });
    }
    invalidate();
  }

  const v = new THREE.Vector3();
  function apply() {
    const { e, s, k } = st;
    const sc = 1 - 0.38 * e;
    const rx = st.pitch - 0.08 * e, ry = st.yaw - 0.74 * e;
    // Slide the separated stack into the space the rear handset vacates.
    const dx = st.w * 0.115 * e;
    front.position.x = dx / k;
    front.scale.setScalar(s * sc);
    front.rotation.set(rx, ry, 0);
    frontBody.position.z = -(1.5 * GAP + 12) * e;

    // Rear handset: angled, showing the camera ring, tucked behind the front one.
    const p = st.pose;
    rear.visible = st.rearOn && e < 0.98;
    rear.scale.setScalar(s * (p ? p.rearScale : 0.9));
    rear.position.set((DEVICE.W * 0.96 + e * 500) * s, (-DEVICE.H * 0.05) * s, -150 * s);
    rear.rotation.set(0.02, Math.PI - 0.5, -0.11, 'YXZ');
    glow.position.set(0, -DEVICE.H * 0.35 * s, -30 * s);

    const rest = Math.abs(rx) < 0.004 && Math.abs(ry) < 0.004 && e < 0.004 && !st.dragging;
    const rot = `translate3d(${dx.toFixed(2)}px, 0, 0) rotateX(${(-rx).toFixed(5)}rad) rotateY(${ry.toFixed(5)}rad)`;
    screenEl.style.transform = rest ? '' : `${rot} translateZ(${(LAYER_Z(0, e) * s * sc * k).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    planeEls.forEach((el, i) => {
      const on = e > 0.02;
      el.style.visibility = on ? 'visible' : 'hidden';
      if (on) {
        el.style.transform = `${rot} translateZ(${(LAYER_Z(i + 1, e) * s * sc * k).toFixed(2)}px) scale(${sc.toFixed(4)})`;
        el.style.opacity = Math.min(1, e * 2.2).toFixed(3);
      }
    });
    if (rest !== st.rest) { st.rest = rest; onRest && onRest(rest); }

    front.updateMatrixWorld(true);
    labelEls.forEach((el, i) => {
      const a = anchors[i];
      if (!a) return;
      a.position.set(0, SCREEN_H / 2, LAYER_Z(i, e));
      a.updateMatrixWorld(true);
      v.setFromMatrixPosition(a.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * st.w, y = (-v.y * 0.5 + 0.5) * st.h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = Math.max(0, Math.min(1, (e - 0.55) * 3)).toFixed(3);
    });
  }

  function frame(t) {
    raf = 0;
    const dt = Math.min(0.25, (t - last) / 1000 || 0.016); last = t;
    let moving = false;
    const ease = (cur, tgt, rate) => {
      if (reducedMotion()) return tgt;
      const d = tgt - cur;
      if (Math.abs(d) < 0.0006) return tgt;
      moving = true;
      return cur + d * (1 - Math.exp(-dt * rate));
    };
    if (!st.dragging) { st.yaw = ease(st.yaw, st.yawT, 9); st.pitch = ease(st.pitch, st.pitchT, 9); }
    if (!st.dragging && st.yaw === st.yawT) {
      // Settle on 0 or π so "at rest" is exact however many turns were made.
      st.yaw = st.yawT = st.flipped ? Math.PI : 0;
    }
    st.e = ease(st.e, st.eT, 12);
    apply();
    renderer.render(scene, camera);
    if (moving) invalidate();
  }

  /* Drag from the frame to turn the handset. Vertical swipes still scroll. */
  if (grabEl) {
    let sx = 0, sy = 0, y0 = 0, id = null;
    grabEl.addEventListener('pointerdown', (ev) => {
      if (st.eT > 0.01 || ev.button > 0) return;
      id = ev.pointerId; sx = ev.clientX; sy = ev.clientY; y0 = st.yaw;
      st.dragging = true; grabEl.setPointerCapture(id); grabEl.classList.add('is-grabbing');
    });
    grabEl.addEventListener('pointermove', (ev) => {
      if (!st.dragging || ev.pointerId !== id) return;
      st.yaw = y0 + (ev.clientX - sx) * 0.009;
      st.pitch = THREE.MathUtils.clamp((ev.clientY - sy) * 0.003, -0.3, 0.3);
      invalidate();
    });
    const end = (ev) => {
      if (!st.dragging || ev.pointerId !== id) return;
      st.dragging = false; grabEl.classList.remove('is-grabbing');
      const turns = Math.round(st.yaw / Math.PI);
      st.yawT = turns * Math.PI; st.pitchT = 0;
      st.flipped = Math.abs(turns) % 2 === 1;
      api.onFlip && api.onFlip(st.flipped);
      invalidate();
    };
    grabEl.addEventListener('pointerup', end);
    grabEl.addEventListener('pointercancel', end);
  }

  const api = {
    ok: true,
    resize,
    invalidate,
    get flipped() { return st.flipped; },
    setFlip(on) {
      st.flipped = on;
      const base = Math.round(st.yaw / (Math.PI * 2)) * Math.PI * 2;
      st.yawT = on ? base + Math.PI : base; st.pitchT = 0;
      api.onFlip && api.onFlip(on);
      invalidate();
    },
    // e: 0 assembled … 1 fully separated
    setExplode(e) {
      if (e > 0.01 && st.flipped) api.setFlip(false);
      if (Math.abs(e - st.eT) < 0.0005) return;
      st.eT = e; invalidate();
    },
    setRear(on) { st.rearOn = on; invalidate(); },
    setPose(pose) { st.pose = pose; invalidate(); },
    state: st,
  };
  return api;
}
