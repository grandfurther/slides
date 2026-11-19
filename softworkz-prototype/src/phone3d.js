// The handset is modelled here, not filmed: edge-to-edge front glass, a slim
// polished titanium frame, satin glass back and a large round camera assembly. All proportions live in
// DEVICE so the model can be re-tuned against the reference mockup in one place.
//
// The HTML phone screen is the source of truth for layout. The 3D camera is
// fitted to it every resize, so the live controls sit exactly on the glass and
// stay ordinary, still DOM while someone is using them.
import * as THREE from 'three';

export const DEVICE = {
  W: 72.6, H: 158.4, T: 7.2, // body, mm (thin, flat-sided)
  R: 15,                     // body corner radius
  frame: 1.05,               // visible metal frame width
  bezel: 1.75,               // body edge to active screen: near edge-to-edge
  screenR: 13.2,             // screen corner radius
  cam: { y: 41, r: 21.5 },   // camera ring: distance from top edge, outer radius
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

// A dark studio with long strip lights. Reflected in polished metal and glass,
// it gives the thin highlight lines that make a product shot read as premium.
function studioEnvironment() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x010102);
  const light = (w, h, pos, power, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  light(1.1, 12, [-7, 0.5, 3.2], 14);            // tall key strip, front left
  light(0.35, 12, [7.2, 0, 2.2], 10, 0xcfe2f5);  // hairline cool strip, front right
  light(9, 2.2, [0, 8, 3], 5);                   // overhead softbox
  light(1.2, 9, [-6.5, 1, 6.5], 0.1);            // soft band that sweeps across the satin back
  light(8, 1.8, [0, 5.2, 8], 0.6);               // low front softbox
  light(7, 7, [0, 0, 9], 0.16);                  // dim panel behind the camera so forward-facing metal still reads
  light(12, 0.8, [0, -7, 3], 1.1, 0x7fb2e0);     // faint cool bounce from the floor
  light(0.5, 10, [-5, 0, -6], 6, 0xcfe2f5);      // rim from behind
  light(0.5, 10, [5.5, 0, -6], 6);
  return s;
}

function buildPhone(mats) {
  const { W, H, T, R, frame, bezel, screenR, cam } = DEVICE;
  const g = new THREE.Group();
  const b = 0.5; // tight chamfer: flat sides, crisp edge

  // Metal frame: a flat-sided ring with a fine chamfer front and back.
  const outer = rr(W - b * 2, H - b * 2, R - b);
  const hole = rr(W - frame * 2, H - frame * 2, R - frame);
  outer.holes.push(new THREE.Path(hole.getPoints(32).reverse()));
  const frameGeo = new THREE.ExtrudeGeometry(outer, {
    depth: T - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 5, curveSegments: 40,
  });
  frameGeo.translate(0, 0, -T + b);
  g.add(new THREE.Mesh(frameGeo, mats.metal));

  // Satin glass back, very slightly domed at the edge (faces -z).
  const backGeo = new THREE.ExtrudeGeometry(rr(W - frame * 2 - 0.5, H - frame * 2 - 0.5, R - frame - 0.25), {
    depth: 0.2, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 4, curveSegments: 40,
  });
  const back = new THREE.Mesh(backGeo, mats.back);
  back.rotation.y = Math.PI; back.position.z = -T + 0.45;
  g.add(back);

  // Front glass and the active display area.
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - frame * 1.7, H - frame * 1.7, R - frame * 0.85), 40), mats.glass);
  glass.position.z = -0.12;
  g.add(glass);
  const screen = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - bezel * 2, H - bezel * 2, screenR), 32), mats.screen);
  screen.position.z = -0.05;
  g.add(screen);

  // Side keys: low, long and flush.
  const key = (x, y, len) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, len, 6, 12), mats.metal);
    m.scale.set(0.42, 1, 1); m.position.set(x, y, -T / 2); g.add(m);
  };
  key(W / 2 + 0.05, 20, 13);
  key(-W / 2 - 0.05, 24, 20);

  // Antenna breaks in the frame.
  [[W / 2 - 14, H / 2], [-(W / 2 - 14), -H / 2]].forEach(([x, y]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, T - 1.2), mats.seam);
    m.position.set(x, y + (y > 0 ? 0.02 : -0.02), -T / 2); g.add(m);
  });

  // Round rear camera assembly: machined bezel, black glass disc, three deep lenses.
  const camG = new THREE.Group();
  camG.position.set(0, H / 2 - cam.y, -T);
  camG.rotation.y = Math.PI; // local +z now points out of the back
  const lathe = (pts, mat) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 128), mat);
    m.rotation.x = Math.PI / 2; return m;
  };
  const disc = (r, z, mat, seg = 96) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mat); m.position.z = z; return m; };
  const r = cam.r;
  camG.add(
    lathe([[r, 0], [r, 1.15], [r - 0.35, 1.7], [r - 1.35, 1.95], [r - 1.7, 1.6]], mats.ring),      // polished chamfered bezel
    disc(r - 1.6, 1.62, mats.glass),                                                           // black glass plate
    lathe([[r - 3.1, 1.64], [r - 3.0, 1.66], [r - 2.9, 1.64]], mats.lensRing),                    // engraved hairline
  );
  [[-8.1, 0.2], [5.6, 8.6], [6.2, -8.0]].forEach(([x, y]) => {
    const lens = new THREE.Group();
    lens.position.set(x, y, 1.63);
    lens.add(
      lathe([[7.0, 0], [7.0, 0.55], [6.7, 0.8], [6.0, 0.8], [5.7, 0.5]], mats.lensRing),     // barrel
      lathe([[5.7, 0.5], [3.4, -0.9], [1.6, -1.3], [0, -1.3]], mats.well),                    // stepped well
      lathe([[4.6, -0.18], [4.5, -0.1], [4.4, -0.18]], mats.lensRing),
      disc(1.5, -1.25, mats.iris, 48),
    );
    // Coated front element: a shallow dome with a hint of lens-coating colour.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 12, 0, Math.PI * 2, 0, 0.45), mats.lens);
    dome.rotation.x = Math.PI / 2; dome.position.z = 0.5 - 13 * Math.cos(0.45) + 0.02;
    lens.add(dome);
    camG.add(lens);
  });
  const flash = disc(1.25, 1.66, mats.flash, 32); flash.position.set(-8.6, 13.2, 1.66);
  const sensor = disc(0.6, 1.66, mats.well, 24); sensor.position.set(-12.6, 9.4, 1.66);
  camG.add(flash, sensor);
  g.add(camG);
  return g;
}

export function createStage({ canvas, stageEl, screenEl, grabEl, floorEl, planeEls = [], labelEls = [], onRest, reducedMotion }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (err) {
    return { ok: false };
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnvironment(), 0.02).texture;
  scene.environmentIntensity = 1;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 50, 6000);
  camera.position.set(0, 0, CAM_D);

  const key = new THREE.DirectionalLight(0xffffff, 0.25); key.position.set(-500, 700, 900);
  // A soft pool of light from upper left: gives the back a falloff instead of a flat fill.
  const pool = new THREE.SpotLight(0xf2f5fa, 2.4, 0, 0.19, 1, 0);
  scene.add(pool, pool.target);
  const glow = new THREE.PointLight(0x7fb2e0, 0.35, 0, 0); glow.position.set(0, -120, -40);
  scene.add(key, glow);

  const css = getComputedStyle(document.documentElement);
  const screenColor = new THREE.Color(css.getPropertyValue('--screen-bg').trim() || '#0b0d10');
  const P = THREE.MeshPhysicalMaterial;
  const mats = {
    // Dark polished titanium.
    metal: new P({ color: 0x7b7f87, metalness: 1, roughness: 0.24, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
    seam: new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.2, roughness: 0.6 }),
    ring: new P({ color: 0xbfc4cc, side: THREE.DoubleSide, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
    lensRing: new THREE.MeshStandardMaterial({ color: 0x1e2126, side: THREE.DoubleSide, metalness: 1, roughness: 0.24 }),
    well: new THREE.MeshStandardMaterial({ color: 0x030304, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
    // Satin glass: dark, with a soft sweep of light rather than a flat fill.
    back: new P({ color: 0x101216, envMapIntensity: 0.3, metalness: 0.3, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.45 }),
    glass: new P({ color: 0x020203, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    lens: new P({ color: 0x04060c, envMapIntensity: 0.28, metalness: 0.1, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessMinimum: 260, iridescenceThicknessMaximum: 520, transparent: true, opacity: 0.9 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x06122a, emissive: 0x0c2552, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2 }),
    flash: new THREE.MeshStandardMaterial({ color: 0xe6dfc8, emissive: 0x3a3626, roughness: 0.35 }),
    screen: new THREE.MeshBasicMaterial({ color: screenColor, toneMapped: false }),
  };

  // Per-material intensity only applies to an explicit envMap, not scene.environment.
  mats.back.envMap = scene.environment;
  mats.lens.envMap = scene.environment;

  const front = new THREE.Group();
  const frontBody = buildPhone(mats);
  front.add(frontBody);
  const anchors = labelEls.map(() => { const o = new THREE.Object3D(); front.add(o); return o; });
  const rear = new THREE.Group();
  rear.add(buildPhone(mats));
  scene.add(rear, front);

  // Polished floor: a mirrored copy of both handsets, faded out by .floor-fade.
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  const mFront = new THREE.Group(); const mFrontBody = buildPhone(mats); mFront.add(mFrontBody);
  const mRear = new THREE.Group(); mRear.add(buildPhone(mats));
  mirror.add(mRear, mFront);
  scene.add(mirror);

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
    if (floorEl) {
      const top = cy + (DEVICE.H / 2 + 0.6) * st.s * st.k;
      floorEl.style.top = `${top.toFixed(1)}px`;
    }
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
    pool.position.set(-DEVICE.W * 1.1 * s, DEVICE.H * 1.0 * s, DEVICE.H * 2.6 * s);
    pool.target.position.set(DEVICE.W * 0.45 * s, DEVICE.H * 0.36 * s, 0);

    const floorY = -(DEVICE.H / 2 + 0.6) * s;
    mirror.visible = e < 0.02;
    mirror.position.y = 2 * floorY;
    mFront.position.copy(front.position); mFront.quaternion.copy(front.quaternion); mFront.scale.copy(front.scale);
    mFrontBody.position.copy(frontBody.position);
    mRear.visible = rear.visible;
    mRear.position.copy(rear.position); mRear.quaternion.copy(rear.quaternion); mRear.scale.copy(rear.scale);

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
