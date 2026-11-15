#!/bin/sh
# Downloads the MediaPipe tracking models used by build.mjs.
set -e
cd "$(dirname "$0")" && mkdir -p vendor && cd vendor
base=https://storage.googleapis.com/mediapipe-models
curl -fsSLO $base/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -fsSLO $base/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
