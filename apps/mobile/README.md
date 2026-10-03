# Mobile capture app

The team selected Android-only React Native; an Expo development build is the recommended starting point. Validate camera, location, background operation, and distance/VIO native-library support before committing. Expo Go does not include arbitrary custom native modules.

Implement session lifecycle, device/vehicle association, location metadata, travelled-distance sampling, lightweight image-quality checks, local pending upload queue, and resumable direct-to-S3 upload.

Follow `.kiro/specs/astig/requirements.md` and `docs/api/contract.md`. Validate distance sampling on target devices; do not substitute noisy GPS deltas for VIO without recording that limitation.
