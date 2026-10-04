# ASTIG demo video (Remotion)

60-second, 1920×1080 product video built as **one continuous timeline** with no hard cuts:
- **Phone part:** intro → the real mobile UI (start session, recording) → its live-view tile morphs into the full-screen drive → capture flash → the frame shrinks into the phone's "Latest" tile → flies to the cloud → morphs into the Gemini analysis (real JSON and the AI box).
- **Web part:** one browser window with a smooth camera that pans and zooms to real element rectangles, and an eased cursor that clicks real buttons: sign-in → map → issue → evidence box → score → work order → field-inspection dialog → close-out dialog → resolved → features → outro.

Standalone project; it is not part of the npm workspaces.

```text
cd video
npm install --workspaces=false
npm run studio      # preview and tweak keyframes in the browser
npm run render      # → out/astig-demo.mp4
```

Timing lives in `src/AstigDemo.tsx`: `CAM` (camera keyframes in page CSS px), `CURSOR`, `CLICKS`, `PAGES`, `DIALOGS`, and the hero tracks in `PhoneAct`.

## Assets (`public/`, git-ignored; never commit footage or screens)

| File | Source |
| --- | --- |
| `drive.mp4`, `capture.jpg` | 5 s of TFH TV Binondo footage (used with permission), redacted with `scripts/stable_redact.py`: faces (deface CenterFace) and plates (OpenCV plate cascade, `plate.xml`) unioned over neighbouring frames, plus feathered manual zones, so the blur does not flicker. Real Gemini detection for the frame; box `[825,535,865,585]` |
| `mobile/setup.jpg`, `rec1.jpg`, `rec2.jpg` | Real Android screenshots (start session, recording). Tile positions are measured from `rec2.jpg` |
| `web/*.jpg`, `web/meta.json` | Live site, captured with `node scripts/capture-web.mjs https://astig-xi.vercel.app/` (env `ASTIG_CAPTURE_PW`): full pages plus element rectangles. **It creates and resolves one live work order**, so run admin `reset-demo` `WORK_ORDERS` afterwards. Dialog crops are `d1a/d1b/d2a/d2b.jpg` |
| `*.wav` | Generated with ffmpeg (pad, shutter, pop, whoosh, ding, tick, key) |

On-screen disclaimers: footage credit and blurring, AI advisory, boxes are AI-estimated, demo data labelled, prototype risk weights.