# Snap-to-Search Backend MVP

This document captures how the Snap-to-Search (Photo -> Exact Home Match) backend prototype is structured inside this repository.

## High-level flow

1. **Client capture** - The mobile app uploads a facade photo plus device location (lat, lon, accuracy) to `POST /api/snap-to-search`.
2. **Search Orchestrator** - Validates that a trustworthy location is present (device preferred, EXIF fallback), derives a search radius, and coordinates downstream calls.
3. **Geo filtering** - The `GeoFilterService` limits the candidate set to properties within the computed radius (default 200-500 m, clamped to <=1 km even after expansions).
4. **Visual matching** - The `VisualMatchService` is isolated and only receives the new photo and the geo-filtered property gallery images. In this MVP it returns deterministic pseudo-scores so the orchestration logic can be exercised without a heavy model.
5. **Ranking** - `MatchRankingService` merges visual similarity, geo proximity, and simple metadata affinity into a confidence score plus human-readable reasons.
6. **Confirmation** - The API responds with the top matches, device distance for transparency, and a `nextActionToken`. Clients must still confirm the selection before deep-linking into the listing page.
7. **Radius expansion** - When a user taps "Not this," the client calls `POST /api/snap-to-search/{token}/expand`. The orchestrator replays the same request context with a larger radius and re-ranks the expanded candidate set.

## API contracts

### POST `/api/snap-to-search`
Multipart form fields:

| Field | Type | Notes |
| --- | --- | --- |
| `photo` | binary | Required, <= 5 MB, in-memory processing. |
| `sessionId` | string | Client session identifier for tracing. |
| `deviceLatitude`/`deviceLongitude`/`deviceAccuracyMeters` | numbers | Required for MVP; the backend prefers these over EXIF. |
| `exifLatitude`/`exifLongitude`/`exifAccuracyMeters` | numbers | Optional fallback if the client cannot read device GPS. |
| `userLabel` | string | Optional, e.g., "Blue house on the corner." |
| `hints` | JSON array or comma-separated string | Optional descriptive cues ("porch", "garage"). |
| `radiusOverrideMeters` | number | Optional for QA forcing a specific radius.

Example response:

```json
{
  "matches": [
    {
      "propertyId": "prop-sil-4821",
      "addressLine": "4821 Juniper Ridge Ave, Redwood Shores, CA",
      "previewImageUrl": "https://images.../preview.jpg",
      "distanceMeters": 47,
      "confidence": 0.91,
      "confidenceLabel": "very_high",
      "reasons": [
        "Strong facade similarity",
        "Within immediate proximity",
        "Porch silhouette detected"
      ],
      "metadata": {
        "visualScore": 0.88,
        "geoScore": 0.82,
        "metadataScore": 0.65
      }
    }
  ],
  "candidateCount": 3,
  "radiusMeters": 350,
  "baseRadiusMeters": 300,
  "expansionLevel": 0,
  "usedLocation": {
    "latitude": 37.5249,
    "longitude": -122.2514,
    "accuracyMeters": 40,
    "source": "device"
  },
  "status": "matches",
  "nextActionToken": "1b15c6e6-..."
}
```

### POST `/api/snap-to-search/{token}/expand`
Replays the stored search context with `expansionLevel + 1`. The response mirrors the initial endpoint but always carries `status: "expanded"` once a radius expansion has been attempted.

## Geo filtering logic

- Location normalization lives in `utils/location.ts`. Device GPS is required for MVP; EXIF is only used when the client truly cannot provide live GPS.
- The starting radius is `max(accuracy * 2, 200)` and capped at 500 m. Each expansion adds 250 m up to a hard cap of 1 km.
- `GeoFilterService` pulls from a geospatial index (represented here by `mockProperties.ts`) and annotates each candidate with haversine distance.
- Candidate counts are logged for observability so we can tune the bounds.

## Matching + ranking

- **Visual matching** is intentionally isolated. The service accepts candidate imagery plus the uploaded buffer and returns similarity scores plus cues explaining why a match is likely (porch geometry, garage presence, etc.). Today this is a deterministic stand-in so we can wire up orchestration before the production model is available.
- **Ranking** blends weighted sub-scores (`0.6 visual`, `0.3 geo`, `0.1 metadata`). Metadata currently checks simple structural flags, but the API surfaces the component scores so future models can be swapped in without changing the contract.
- Confidence labels (`low`, `medium`, `high`, `very_high`) are designed for the confirmation UI copy.

## Services & separation of concerns

| Component | Responsibility | Location |
| --- | --- | --- |
| `SearchOrchestrator` | Governs request lifecycle, validates location, computes radius, sequences geo filter -> visual match -> ranking, and returns structured results. | `src/services/searchOrchestrator.ts` |
| `GeoFilterService` | Talks to the nearby listings index (mocked here), applies the radius filter, and sorts by distance. | `src/services/geoFilterService.ts` |
| `VisualMatchService` | Encapsulates facade-similarity logic so it can be swapped for a stronger ML model later without touching orchestration. | `src/services/visualMatchService.ts` |
| `MatchRankingService` | Normalizes individual scores and assembles the human-readable rationale for each candidate. | `src/services/matchRankingService.ts` |
| `ListingMediaService` | Fetches up-to-date preview/gallery imagery per property from the RE API so UI cards render real photos. | `src/services/listingMediaService.ts` |
| `InMemorySessionStore` | Keeps per-photo context (photo buffer, normalized location, expansion level) so "Not this" can replay the same inputs with a wider radius. | `src/services/sessionStore.ts` |
| `SnapToSearchController` | HTTP boundary: input validation, file handling, and mapping API calls to orchestrator operations. | `src/controllers/snapToSearchController.ts` |

## Next steps

- Swap the mock geo dataset with the actual listing imagery retrieval API once it is available.
- Replace the deterministic visual scorer with the production embedding-based model (the service envelope already supports this).
- Move the in-memory session store into Redis or DynamoDB so multiple API instances can participate in the same session.
- Extend telemetry (e.g., Datadog spans) before rolling out to beta markets.
