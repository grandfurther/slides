// Builds the single-file xray-mirror.html (everything embedded, works by double-click, no server).
//
//   cd xray-mirror/tools && npm install && node build.mjs
//
// Needs the two MediaPipe model files next to this script's vendor folder; fetch.sh downloads them.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const nm = join(here, 'node_modules');
const read = (p) => readFileSync(p);
const need = (p) => { if (!existsSync(p)) { console.error('Missing ' + p + ' — run npm install and ./fetch.sh first'); process.exit(1); } return p; };

const safe = (js) => js.toString('utf8').replace(/<\/script/gi, '<\\/script');
const three = safe(read(need(join(nm, 'three/build/three.min.js'))));
const vision = safe(read(need(join(nm, '@mediapipe/tasks-vision/vision_bundle.cjs')))).replace(/\/\/# sourceMappingURL=.*$/m, '');
const app = safe(read(join(root, 'src/app.js')));

const bin = {
  anatomy: join(root, 'assets/anatomy.bin'),
  wasmjs: join(nm, '@mediapipe/tasks-vision/wasm/vision_wasm_internal.js'),
  wasm: join(nm, '@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm'),
  face: join(here, 'vendor/face_landmarker.task'),
  hand: join(here, 'vendor/hand_landmarker.task'),
};
let embed = '';
for (const [name, p] of Object.entries(bin))
  embed += `<script type="application/base64" id="asset-${name}">${read(need(p)).toString('base64')}</script>\n`;
embed += `<script>${three}</script>\n`;
embed += `<script>(function(){var exports={},module={exports:exports};${vision}\n;window.MPVision=module.exports;})();</script>\n`;
embed += `<script>${app}</script>\n`;

const html = read(join(root, 'src/index.html')).toString('utf8').replace('<!--EMBED-->', () => embed);
const out = join(root, 'xray-mirror.html');
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1048576).toFixed(1) + ' MB');
