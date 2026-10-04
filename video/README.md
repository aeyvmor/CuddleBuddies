# ASTIG demo video (Remotion)

45-second, 1920×1080 product video: intro → start journey (phone) → drive POV → capture → upload to cloud → Gemini analysis with boxes → sign-in and officer map → issue dashboard → work order created and field inspection → resolved → features → outro. Standalone project; it is not part of the npm workspaces.

```text
cd video
npm install --workspaces=false
npm run studio      # preview and tweak timings in the browser
npm run render      # → out/astig-demo.mp4
```

## Assets (`public/`, git-ignored; never commit footage or screens)

| File | Source |
| --- | --- |
| `drive.mp4`, `capture.jpg` | 5 s of TFH TV Binondo footage (used with permission). Faces blurred with `deface`, plates with the cascade plus manual zones, then reviewed. Real Gemini detection for that frame; box `[825,535,865,585]` |
| `web-*.png` | Live site, read-only, captured with `node scripts/capture.mjs live https://astig-xi.vercel.app/` (env `ASTIG_CAPTURE_PW`) |
| `wo-*.png` | Work-order and field-report flow from a **mock** build (`VITE_ASTIG_API=mock`, synthetic data), so live data is not changed: `node scripts/capture.mjs mock http://localhost:4174/` |
| `mobile-1.png` … `mobile-3.png` (optional) | Real screenshots from the Android app (portrait). Shown in the phone on the "Start journey" scene; until added, the phone shows the drive clip |
| `*.wav` | Generated with ffmpeg (shutter, pop, whoosh, ding, tick, pad) |

On-screen disclaimers: footage credit and blurring, AI advisory, boxes are AI-estimated, demo data labelled, prototype risk weights.
