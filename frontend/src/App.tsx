import { useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

type ListingSummary = {
  listingId: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  listingUrl?: string | null;
};

type PHashMatch = {
  listingId: string;
  filename: string;
  hash: string;
  distance: number;
  previewImageUrl: string; // backend returns absolute now
  details: ListingSummary | null;
};

type PHashResponse = {
  queryHash: string;
  top: PHashMatch[];
  error?: string;
};

interface UiState {
  loading: boolean;
  error?: string;
  info?: string;
}

const INITIAL_DISPLAY_LIMIT = 10;

function fmtMoney(n?: number | null) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtNum(n?: number | null) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString();
}

function App() {
  const parseNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uiState, setUiState] = useState<UiState>({ loading: false });
  const [queryHash, setQueryHash] = useState<string | null>(null);
  const [top, setTop] = useState<PHashMatch[]>([]);
  const [showAllMatches, setShowAllMatches] = useState(false);

  const [radiusMiles, setRadiusMiles] = useState<number>(5);
  const [manualLatitude, setManualLatitude] = useState<string>('');
  const [manualLongitude, setManualLongitude] = useState<string>('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetResults = () => {
    setQueryHash(null);
    setTop([]);
    setShowAllMatches(false);
  };

  const handleFileSelection = (file: File | null) => {
    resetResults();
    setUiState({ loading: false });

    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const handlePHashTest = async () => {
    if (!selectedFile) return;

    resetResults();
    setUiState({ loading: true, info: 'Finding matches (pHash top 5)…' });

    try {
      const formData = new FormData();
      formData.append('photo', selectedFile, selectedFile.name || 'photo.jpg');

    const radiusMeters = radiusMiles * 1609.344;
    formData.append('radiusOverrideMeters', String(radiusMeters));
    formData.append('radiusMiles', String(radiusMiles));

      const lat = parseNumber(manualLatitude);
      const lon = parseNumber(manualLongitude);
      if (typeof lat === 'number' && typeof lon === 'number') {
        formData.append('manualLatitude', String(lat));
        formData.append('manualLongitude', String(lon));
      }

      const response = await fetch(`${API_BASE_URL}/api/phash-test`, {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as PHashResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? 'pHash request failed');
      }

      setQueryHash(payload.queryHash);
      setTop(payload.top ?? []);
      setShowAllMatches(false);
      setUiState({ loading: false, info: payload.top?.length ? undefined : 'No matches found.' });
    } catch (err) {
      setUiState({ loading: false, error: (err as Error).message });
    }
  };

  const ready = Boolean(selectedFile && !uiState.loading);
  const displayedMatches = showAllMatches ? top : top.slice(0, Math.min(top.length, INITIAL_DISPLAY_LIMIT));

  return (
    <main className="app-shell">
      <header>
        <h1>Snap-to-Search</h1>
        <p>pHash prototype: upload a photo and get top-5 closest matches, with listing details.</p>
      </header>

      <section className="capture-panel">
        <div className="button-row">
          <button type="button" onClick={() => captureInputRef.current?.click()} className="primary">
            Capture Image
          </button>
          <button type="button" onClick={() => uploadInputRef.current?.click()} className="secondary">
            Upload Image
          </button>
        </div>

        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
        />

        <div style={{ marginTop: 12 }}>
          <p className="info">
            Location is derived from the photo's EXIF metadata, so make sure the image contains GPS
            coordinates before searching.
          </p>
          <div style={{ marginTop: 10 }}>
            <label>
              Search radius (miles): <b>{radiusMiles.toFixed(1)}</b>
            </label>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <small>Tip: Start with 0.5 miles, increase if results are sparse.</small>
          </div>
          <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
            <strong>Manual location (for testing only)</strong>
            <p style={{ margin: 0 }}>
              Fill both latitude and longitude to override the missing EXIF GPS data. Clear the fields
              when you're done so the photo's metadata is used again.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 180px' }}>
                Latitude
                <input
                  type="number"
                  step="0.000001"
                  value={manualLatitude}
                  onChange={(e) => setManualLatitude(e.target.value)}
                  placeholder="e.g. 37.1305"
                />
              </label>
              <label style={{ flex: '1 1 180px' }}>
                Longitude
                <input
                  type="number"
                  step="0.000001"
                  value={manualLongitude}
                  onChange={(e) => setManualLongitude(e.target.value)}
                  placeholder="-121.6544"
                />
              </label>
            </div>
          </div>
        </div>

        {previewUrl ? (
          <div className="preview-card">
            <img src={previewUrl} alt="Selected" />
            <div>
              <strong>Selected photo</strong>
              <p>{selectedFile?.name ?? 'Captured photo'}</p>
              <button type="button" className="text" onClick={() => handleFileSelection(null)}>
                Remove photo
              </button>
            </div>
          </div>
        ) : (
          <p className="placeholder">No photo selected yet.</p>
        )}

        <button type="button" className="cta" disabled={!ready} onClick={handlePHashTest}>
          {uiState.loading ? 'Searching…' : 'Find matches (pHash top 5)'}
        </button>

        {uiState.error && <p className="error">{uiState.error}</p>}
        {uiState.info && <p className="info">{uiState.info}</p>}
      </section>

      {top.length > 0 && (
        <section className="results-panel">
          <div className="results-header">
            <div>
              <h2>Top matches</h2>
              {queryHash && <p>Query hash: {queryHash}</p>}
              {top.length > 0 && (
                <p className="info">
                  Showing {displayedMatches.length} of {top.length} matches.
                </p>
              )}
            </div>
          </div>

          <div className="matches-grid">
            {displayedMatches.map((m) => {
              const d = m.details;
              const title =
                d?.addressLine
                  ? `${d.addressLine}${d.city ? `, ${d.city}` : ''}${d.state ? ` ${d.state}` : ''}${d.zip ? ` ${d.zip}` : ''}`
                  : `Listing ${m.listingId}`;

              return (
                <article key={m.listingId} className="match-card">
                  <img src={m.previewImageUrl} alt={title} />
                  <div className="match-body">
                    <h3>{title}</h3>

                    <p>
                      pHash distance: <strong>{m.distance}</strong>
                    </p>

                    <p>
                      Price: <strong>{fmtMoney(d?.price ?? null)}</strong>
                    </p>
                    <p>
                      Beds/Baths: <strong>{d?.beds ?? '—'}</strong> / <strong>{d?.baths ?? '—'}</strong>
                    </p>
                    <p>
                      Sqft: <strong>{fmtNum(d?.sqft ?? null)}</strong>
                    </p>

                  </div>
                </article>
              );
            })}
          </div>
          {top.length > INITIAL_DISPLAY_LIMIT && (
            <div className="results-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAllMatches((prev) => !prev)}
              >
                {showAllMatches ? 'Show top 10 only' : 'Show 20 matches'}
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
