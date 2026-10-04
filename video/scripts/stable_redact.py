"""Temporally stable redaction for the demo drive clip (no flicker).

Per frame: detect faces (deface's CenterFace) and plates (OpenCV cascade). Each frame then blurs
the UNION of detections from neighbouring frames (+/- HOLD), dilated, plus fixed manual zones that
fade in/out instead of switching. The mask is feathered and averaged over time, so blur regions move
smoothly instead of popping. Usage: python stable_redact.py <in_dir> <out_dir>
"""
import pathlib
import sys

import cv2
import numpy as np
from deface.centerface import CenterFace

HOLD = 18        # frames of temporal union each side
DILATE = 0.25    # grow every box by 35%
RAMP = 12        # frames to fade manual zones in/out
# (first_frame, last_frame, (x0, y0, x1, y1) normalized) reviewed on the 2026-10-04 contact sheets
ZONES = [
    ((1, 150), (0.0, 0.62, 0.13, 0.86)),
    ((1, 150), (0.58, 0.56, 0.72, 0.70)),
    ((1, 150), (0.86, 0.60, 1.0, 0.97)),
    ((30, 125), (0.58, 0.68, 0.80, 0.92)),
    ((55, 125), (0.78, 0.66, 1.0, 0.97)),
    ((110, 150), (0.08, 0.58, 0.40, 0.80)),
]

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
files = sorted(src.glob("raw_*.jpg"))
face = CenterFace(in_shape=None, backend="auto")
plate = cv2.CascadeClassifier(str(pathlib.Path(__file__).with_name("plate.xml")))

frames = [cv2.imread(str(f)) for f in files]
h, w = frames[0].shape[:2]
dets = []
for img in frames:
    boxes = []
    fd, _ = face(img, threshold=0.3)
    for x0, y0, x1, y1, *_ in fd:
        boxes.append((x0, y0, x1, y1))
    gray = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    for x, y, bw, bh in plate.detectMultiScale(gray, 1.05, 3, minSize=(int(w * 0.025), int(h * 0.012))):
        # Plates sit on vehicles at road level and are small; drop hits on facades and signage.
        if y < h * 0.5 or bw > w * 0.12:
            continue
        boxes.append((x - bw * 0.35, y - bh * 0.6, x + bw * 1.35, y + bh * 1.6))
    dets.append(boxes)


def raw_mask(i: int) -> np.ndarray:
    m = np.zeros((h, w), np.float32)
    for j in range(max(0, i - HOLD), min(len(frames), i + HOLD + 1)):
        for x0, y0, x1, y1 in dets[j]:
            dx, dy = (x1 - x0) * DILATE / 2, (y1 - y0) * DILATE / 2
            cv2.rectangle(m, (int(x0 - dx), int(y0 - dy)), (int(x1 + dx), int(y1 + dy)), 1.0, -1)
    n = i + 1
    for (a, b), (x0, y0, x1, y1) in ZONES:
        alpha = float(np.clip(min(n - a + RAMP, b - n + RAMP) / RAMP, 0, 1))
        if alpha > 0:
            sub = m[int(h * y0):int(h * y1), int(w * x0):int(w * x1)]
            np.maximum(sub, alpha, out=sub)
    return cv2.GaussianBlur(m, (0, 0), 6)


masks = [raw_mask(i) for i in range(len(frames))]
for i, img in enumerate(frames):
    # Temporal average of neighbouring masks, then never let it drop below this frame's own mask.
    lo, hi = max(0, i - 10), min(len(frames), i + 11)
    m = np.maximum(np.mean(masks[lo:hi], axis=0), masks[i])[..., None]
    blurred = cv2.GaussianBlur(img, (0, 0), 22)
    out = (img * (1 - m) + blurred * m).astype(np.uint8)
    cv2.imwrite(str(dst / f"f_{i + 1:04d}.jpg"), out, [cv2.IMWRITE_JPEG_QUALITY, 92])
print(f"redacted {len(frames)} frames; detections per frame avg {sum(map(len, dets)) / len(dets):.1f}")
