# Snap-to-Search Frontend Capture UX

This doc sketches the minimal UI required on the Snaphomz homepage AI Search Bar so users can either upload an existing photo or capture a new one on-device before calling the backend endpoints implemented in this repo.

## Entry points

1. **Capture Image**
   - Visible when camera permissions are available.
   - Tapping opens the native camera (via `MediaDevices.getUserMedia` on web or the platform capture intent in the mobile app).
   - Once the shutter fires, show a review state with the captured photo, detected GPS (lat/lon/accuracy), and buttons: `Retake`, `Use Photo`.
   - On `Use Photo`, build `FormData` with the JPEG blob + location payload and call `POST /api/snap-to-search`.

2. **Upload Image**
   - Presents the system file picker for gallery/desktop uploads.
   - After selection, render the preview plus an inline prompt to enable location. If fine location is missing, guide user to grant permissions (MVP requires it; EXIF is fallback only).
   - When both photo + location are present, enable `Find This Home` which fires the same API call.

Both entry points share the same confirmation surface once the backend responds.

## Confirmation surface

- Show top 3 matches returned by the backend, each card containing preview image, address, distance (e.g., `45 m away`), and confidence tag (mapping from `confidenceLabel`).
- Copy above the list: `Is this the home you're looking at?`
- Buttons:
  - Tap on a match card -> open listing detail (only after user confirmation).
  - `Not this` -> call `POST /api/snap-to-search/{token}/expand` with `nextActionToken` to widen the radius.
  - Optional `Cancel` -> dismisses session.

## Location handling

- Request fine location permission as soon as the capture/upload modal opens. Show a blocking notice if denied because MVP requires it.
- Include location telemetry (lat/lon/accuracy) in both capture and upload paths. If the device cannot provide it, warn the user that fallback EXIF data may be stale.

## Error states

- **Missing location**: disable submission and show CTA to grant permissions.
- **Backend 400/500**: show toast `Couldn't process that photo. Please retake or try again later.`
- **Camera denied**: keep `Capture Image` button but pair with message `Enable camera access in settings`.

## Implementation tips

- Wrap both buttons in a single component (`SnapToSearchCapturePanel`) so analytics logs the entry point used (`capture` vs `upload`).
- Reuse the same `FormData` builder for both flows to avoid diverging payloads.
- Persist `nextActionToken` + last response in local state so that `Not this` simply reuses the stored photo buffer without forcing the user to re-upload.

This UX keeps the MVP simple while matching the backend contract described in `docs/snap-to-search.md`.
