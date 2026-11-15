# X-ray Mirror

Point a webcam at your face and see the skull, brain and muscles inside your head, tracked live as you move.
Open your mouth and the jaw opens. Hold up a hand and you see its bones.

## Run it

1. Download `xray-mirror.html` (about 30 MB, everything is inside the one file).
2. Double-click it. It opens in your browser. Chrome or Edge work best.
3. Press **Start camera** and allow camera access.

Nothing is installed and nothing is uploaded: tracking and drawing happen in the browser, and the video never leaves the computer. It also works offline.

## Use it on a call

- **Quickest:** press `H` to hide the controls (and `F` for fullscreen), then share that window or tab in Zoom, Meet or Teams.
- **As your camera:** install [OBS Studio](https://obsproject.com), add a *Window Capture* of the X-ray Mirror window, click *Start Virtual Camera*, then choose "OBS Virtual Camera" as the camera in your call app.
- On Windows, turn your camera off in the call app first. Two apps often cannot use one webcam at the same time.

## Controls

| Control | What it does |
| --- | --- |
| Skull / Brain / Muscles / Everything | One-click layer presets |
| Layer checkboxes | Skull, brain, muscles, eyes, head outline, hand bones |
| Show labels | Names of the structures, with leader lines |
| Fit to my head | Overall size, width and height of the anatomy, plus glow strength |
| Mirror image | Flip the picture like a mirror (on by default) |
| Show tracking data | Tracking points, frame rate and timing |
| `H` or double-click | Hide or show the controls |
| `F` | Fullscreen |

Settings are remembered in the browser.

## Rebuild from source

```sh
cd tools
npm install        # three.js and MediaPipe Tasks Vision
./fetch.sh         # MediaPipe face and hand tracking models
node build.mjs     # writes ../xray-mirror.html
```

- `src/index.html`, `src/app.js`: the page and the tracking / rendering code.
- `assets/anatomy.bin`: the simplified anatomy meshes, registered to the face-tracking model.
- `tools/preprocess.py`: regenerates `anatomy.bin` from the BodyParts3D STL files
  (`python3 preprocess.py <stl_dir> <canonical_face_model.obj> ../assets/anatomy.bin`; needs `numpy`, `trimesh`, `fast-simplification`).

## Credits and licenses

- Anatomy models: **BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan.**
  `assets/anatomy.bin` (and the copy embedded in `xray-mirror.html`) is a simplified derivative and is shared under the same license.
- Tracking: MediaPipe Tasks Vision and its face / hand landmark models (Apache 2.0).
- Rendering: three.js (MIT).

This is a visual party trick, not a medical tool. The anatomy is one generic model scaled to your head.
