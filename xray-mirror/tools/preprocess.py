"""Build anatomy.bin for the X-ray mirror from BodyParts3D STL parts.

Usage: python3 preprocess.py <stl_dir> <canonical_face_model.obj> <out.bin> [debug.png]
Anatomy models: BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan.
"""
import sys, json, struct
import numpy as np, trimesh, fast_simplification

STL, CANON, OUT = sys.argv[1:4]
DBG = sys.argv[4] if len(sys.argv) > 4 else None
F = lambda *a: ['FMA%s' % x for x in a]

def load(i):
    m = trimesh.load(f'{STL}/{i}.stl', process=False)
    m.merge_vertices()
    v = np.asarray(m.vertices, dtype=np.float64)
    # BodyParts3D: mm, x = subject's left, -y = front, z = up  ->  x right-in-image, y up, z front
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1), np.asarray(m.faces, dtype=np.int64)

def simplify(v, f, target):
    if len(f) <= target: return v, f
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_count=int(target))
    return v2.astype(np.float64), f2.astype(np.int64)

def merge(parts):
    vs, fs, o = [], [], 0
    for v, f in parts:
        vs.append(v); fs.append(f + o); o += len(v)
    return np.concatenate(vs), np.concatenate(fs)

def group(ids, budget):
    raw = [load(i) for i in ids]
    tot = sum(len(f) for _, f in raw)
    return merge([simplify(v, f, max(60, len(f) * budget / tot)) for v, f in raw])

SKULL = F(52735, 52734, 52736, 52740, 9710, 52738, 52739, 52788, 52789, 52892, 52893, 53645, 53646, 53647, 53648, 53649, 53650, 53655, 53656, 54737, 54738)
TEETH_UP = F(55680, 55681, 55682, 55683, 55688, 55689, 55690, 55691, 55697, 55698, 55699, 55700, 55798, 55799)
TEETH_LO = F(55686, 55687, 55692, 55693, 55694, 55695, 55703, 55704, 55705, 55706, 57140, 57141, 57142, 57143)
BRAIN = F(72653, 72654, 72655, 72656, 72661, 72662, 72665, 72666, 72667, 72668, 72669, 72670, 72685, 72686, 72687, 72688, 72689, 72690,
          72701, 72702, 72705, 72706, 72717, 72718, 72800, 72801, 72804, 72805, 72975, 72976, 72977, 72978, 67944, 67943, 62004, '61993nsn') + ['BP49', 'BP50', 'BP51']
MUSC_JAW = F(46826, 46827, 46817, 46818, 46829, 46830)
MUSC = F(46759, 46760, 46782, 46783, 46785, 46786, 46841, 46796, 46797, 46803, 46804, 46806, 46807, 46812, 46813, 46814, 46815,
         46835, 46836, 46839, 46840, 49001, 49002, 49004, 49005, 49007, 49008, 55606, 55607, 55608, 55609, 55610, 55611, 46761, 46762, 46763, 46764)

# ---------- head skin (outline layer + registration target) ----------
sv, sf = load('FMA7163')
keep = sv[:, 1] > 1368.0                      # head plus upper neck (the page fades the neck out)
fk = sf[keep[sf].all(1)]
used = np.unique(fk); remap = -np.ones(len(sv), int); remap[used] = np.arange(len(used))
skin_v, skin_f = sv[used], remap[fk]
skin_full = skin_v.copy()

# ---------- registration: canonical face model (cm) -> BodyParts3D head (mm) ----------
canon = np.array([[float(x) for x in l.split()[1:4]] for l in open(CANON) if l.startswith('v ')])[:468]
# Both heads are upright and face forward, so the rotation is identity. The scale (mm per canonical cm) comes from
# vertical face proportions (eye line -> nose tip -> mouth); the offset from the eyes, the nose tip and the incisors.
# (The BodyParts3D eyes are set closer together than the canonical face, so eye spacing is not used for scale.)
ev_, _ = load('FMA12513')
inc = np.concatenate([load('FMA55681')[0], load('FMA55682')[0]])
eye_m = ev_.mean(0); nose_m = skin_full[np.argmax(skin_full[:, 2])]; inc_y = inc[:, 1].min()
eye_c = (canon[33] + canon[133] + canon[362] + canon[263]) / 4; nose_c = canon[4]; mouth_cy = canon[13][1] - 0.1
R = np.eye(3)
s = 0.5 * ((eye_m[1] - nose_m[1]) / (eye_c[1] - nose_c[1]) + (eye_m[1] - inc_y) / (eye_c[1] - mouth_cy))
ty = (2 * (eye_m[1] - s * eye_c[1]) + (nose_m[1] - s * nose_c[1]) + (inc_y - s * mouth_cy)) / 4
t = np.array([eye_m[0], ty, nose_m[2] - s * nose_c[2]])
print('fit scale mm/cm', round(s, 3), 'offset', t.round(1), 'nose tip', nose_m.round(1))
def to_canon(v):                               # mm model -> canonical face-model cm
    return ((v - t) @ R) / s

# ---------- head meshes ----------
meshes = []
def add(name, layer, grp, v, f):
    meshes.append(dict(name=name, layer=layer, group=grp, v=np.asarray(v, np.float64), f=np.asarray(f, np.int64)))
    print(f'{name:12s} verts {len(v):6d} tris {len(f):6d}')

parts = {}
def head(name, layer, grp, ids, budget):
    v, f = group(ids, budget); add(name, layer, grp, to_canon(v), f)

head('cranium', 'skull', 'head', SKULL, 64000)
head('teeth_up', 'skull', 'head', TEETH_UP, 9000)
head('mandible', 'skull', 'jaw', F(52748), 12000)
head('teeth_lo', 'skull', 'jaw', TEETH_LO, 8000)
head('brain', 'brain', 'head', BRAIN, 64000)
head('eyes', 'eyes', 'head', F(12513), 1600)
head('muscles', 'muscles', 'head', MUSC, 40000)
head('muscles_jaw', 'muscles', 'jaw', MUSC_JAW, 5000)
ov, of = simplify(skin_v, skin_f, 9000)
ev, ef = group(F(52780), 1500)
ov, of = merge([(ov, of), (ev, ef)])
add('outline', 'outline', 'head', to_canon(ov), of)

# ---------- jaw pivot (mandibular condyles) ----------
mv = to_canon(load('FMA52748')[0])
back = mv[mv[:, 2] < np.percentile(mv[:, 2], 12)]
cond = [side[np.argmax(side[:, 1])] for side in (back[back[:, 0] < 0], back[back[:, 0] > 0])]
pivot = (cond[0] + cond[1]) / 2; pivot[0] = 0
print('jaw pivot', pivot.round(2), 'chin lm152', canon[152].round(2))

# ---------- labels ----------
head_c = to_canon(skin_full).mean(0)
def anchor(ids, side=None):
    v = np.concatenate([load(i)[0] for i in ids])
    v = to_canon(v)
    if side is not None: v = v[v[:, 0] * side > 0]
    c = v.mean(0); o = c - head_c; o /= np.linalg.norm(o)
    return v[np.argmax(v @ o - 0.15 * np.linalg.norm(v - c, axis=1))].round(3).tolist()
def lab(text, layer, a, b=None, grp='head'):
    pts = [anchor(F(*a) if not isinstance(a[0], str) else a)]
    if b: pts.append(anchor(F(*b) if not isinstance(b[0], str) else b))
    return dict(text=text, layer=layer, group=grp, pts=pts)
labels = [
    lab('Frontal bone', 'skull', [52734]), lab('Parietal bone', 'skull', [52788], [52789]),
    lab('Temporal bone', 'skull', [52738], [52739]), lab('Occipital bone', 'skull', [52735]),
    lab('Nasal bone', 'skull', [53647], [53648]), lab('Zygomatic bone (cheekbone)', 'skull', [52892], [52893]),
    lab('Maxilla (upper jaw)', 'skull', [53649], [53650]), lab('Mandible (lower jaw)', 'skull', [52748], grp='jaw'),
    lab('Teeth', 'skull', [55681, 55682]),
    lab('Frontal lobe', 'brain', [72653, 72655, 72661], [72654, 72656, 72662]),
    lab('Parietal lobe', 'brain', ['FMA72665', 'FMA72667', 'FMA72669', 'BP50'], ['FMA72666', 'FMA72668', 'FMA72670', 'BP49']),
    lab('Temporal lobe', 'brain', [72685, 72687, 72800, 72804], [72686, 72688, 72801, 72805]),
    lab('Occipital lobe', 'brain', [72975], [72976]), lab('Cerebellum', 'brain', [67944]),
    lab('Pons (brainstem)', 'brain', [67943]), lab('Medulla oblongata', 'brain', [62004]),
    dict(text='Eyeball', layer='eyes', group='head', pts=[anchor(F(12513), -1), anchor(F(12513), 1)]),
    lab('Frontalis', 'muscles', [46759], [46760]), lab('Temporalis', 'muscles', [49007], [49008]),
    lab('Orbicularis oculi', 'muscles', [46782], [46783]), lab('Nasalis', 'muscles', [55606], [55607]),
    lab('Zygomaticus major', 'muscles', [46812], [46813]), lab('Masseter', 'muscles', [49001], [49002]),
    lab('Orbicularis oris', 'muscles', [46841]), lab('Depressor anguli oris', 'muscles', [46829], [46830], grp='jaw'),
]

# ---------- hand (right hand; mirrored at runtime for the other one) ----------
CARPALS = F(24435, 24437, 24439, 24441, 24443, 23725, 24446, 24448)
META = F(24464, 24466, 24468, 24470, 24472)
PROX = F(24450, 24451, 24452, 24453, 24454)
MID = [None] + F(24455, 24456, 24457, 24458)
DIST = F(24459, 24460, 24461, 24462, 24463)
raw = {i: load(i) for i in CARPALS + META + PROX + MID[1:] + DIST}
carp_c = np.concatenate([raw[i][0] for i in CARPALS]).mean(0)
def ends(i, ref):
    v = raw[i][0]; c = v.mean(0)
    ax = np.linalg.svd(v - c, full_matrices=False)[2][0]
    p = (v - c) @ ax
    a, b = c + ax * p.min(), c + ax * p.max()
    return (a, b) if np.linalg.norm(a - ref) < np.linalg.norm(b - ref) else (b, a)
E = {}
for k in range(5):
    E[META[k]] = ends(META[k], carp_c)
    E[PROX[k]] = ends(PROX[k], E[META[k]][1])
    prev = E[PROX[k]][1]
    if MID[k]: E[MID[k]] = ends(MID[k], prev); prev = E[MID[k]][1]
    E[DIST[k]] = ends(DIST[k], prev)
mcp = [E[META[k]][1] for k in range(5)]
lateral = mcp[4] - mcp[1]; lateral /= np.linalg.norm(lateral)       # index -> little finger
updir = mcp[2] - carp_c
normal = np.cross(lateral, updir); normal /= np.linalg.norm(normal)
# wrist landmark ~ centre of the proximal carpal row, slightly proximal
prox_row = np.concatenate([raw[i][0] for i in F(24435, 24437, 24439)])
u = updir / np.linalg.norm(updir)
wrist = prox_row.mean(0) - u * 6.0
hand_origin = wrist
def hl(p): return (np.asarray(p) - hand_origin)                      # hand-local mm
bones = []
def bone(i, kind, finger, lm_a, lm_b, shrink):
    v, f = raw[i]; v, f = simplify(v, f, max(150, len(f) * 0.42))
    a, b = E[i]; y = b - a; L = np.linalg.norm(y); y /= L
    if finger == 0:
        z = normal - (normal @ y) * y; z /= np.linalg.norm(z); x = np.cross(y, z)
    else:
        x = lateral - (lateral @ y) * y; x /= np.linalg.norm(x); z = np.cross(x, y)
    M = np.stack([x, y, z], 1)                                       # columns
    add(f'{kind}{finger}', 'hand', 'bone', ((v - a) @ M) / L, f)
    bones.append(dict(mesh=len(meshes) - 1, kind=kind, finger=finger, a=lm_a, b=lm_b, shrink=shrink, base=hl(a).round(3).tolist()))
cv, cf = merge([simplify(*raw[i], max(150, len(raw[i][1]) * 0.42)) for i in CARPALS])
add('carpals', 'hand', 'palm', hl(cv), cf); carp_mesh = len(meshes) - 1
for k in range(5):
    j = 1 + 4 * k
    bone(META[k], 'meta', k, j if k == 0 else -1, j + 1 if k == 0 else j, 1.0)
    if k == 0:
        bone(PROX[k], 'prox', k, 2, 3, 0.94); bone(DIST[k], 'dist', k, 3, 4, 0.8)
    else:
        bone(PROX[k], 'prox', k, j, j + 1, 0.94); bone(MID[k], 'mid', k, j + 1, j + 2, 0.94); bone(DIST[k], 'dist', k, j + 2, j + 3, 0.8)
hand = dict(carpals=carp_mesh, bones=bones,
            ref=dict(lm=[0, 5, 9, 13, 17], pts=[hl(wrist).round(3).tolist()] + [hl(mcp[k]).round(3).tolist() for k in (1, 2, 3, 4)]),
            lateral=lateral.round(5).tolist(), normal=normal.round(5).tolist())

# ---------- write ----------
blob = bytearray(); metas = []
for m in meshes:
    v, f = m['v'], m['f']
    lo, hi = v.min(0), v.max(0)
    q = np.round((v - lo) / (hi - lo) * 65535).astype('<u2')
    it = '<u2' if len(v) < 65536 else '<u4'
    po = len(blob); blob += q.tobytes(); blob += b'\0' * (-len(blob) % 4)
    io = len(blob); blob += f.astype(it).tobytes(); blob += b'\0' * (-len(blob) % 4)
    metas.append(dict(name=m['name'], layer=m['layer'], group=m['group'], nv=len(v), ni=int(f.size), u32=it == '<u4',
                      pos=po, idx=io, lo=lo.round(5).tolist(), hi=hi.round(5).tolist()))
hdr = json.dumps(dict(meshes=metas, labels=labels, jaw=dict(pivot=pivot.round(3).tolist(), chin=canon[152].round(3).tolist()),
                      canon=canon.round(4).tolist(), hand=hand,
                      credit='BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan'),
                 separators=(',', ':')).encode()
hdr += b' ' * (-len(hdr) % 4)
open(OUT, 'wb').write(struct.pack('<I', len(hdr)) + hdr + bytes(blob))
print('wrote', OUT, (4 + len(hdr) + len(blob)) // 1024, 'KB; tris', sum(len(m['f']) for m in meshes))

if DBG:
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    sk = to_canon(skin_full)[::7]; cr = meshes[0]['v'][::5]; mu = meshes[6]['v'][::5]
    fig, ax = plt.subplots(1, 2, figsize=(14, 8))
    for a, (i, j) in zip(ax, ((0, 1), (2, 1))):
        a.scatter(sk[:, i], sk[:, j], s=1, c='#bbb'); a.scatter(cr[:, i], cr[:, j], s=1, c='#48f')
        a.scatter(canon[:, i], canon[:, j], s=6, c='r'); a.scatter([pivot[i]], [pivot[j]], s=80, c='g'); a.set_aspect('equal')
    fig.savefig(DBG, dpi=70)
