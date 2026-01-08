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

function fmtMoney(n?: number | null) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtNum(n?: number | null) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString();
}

function App() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uiState, setUiState] = useState<UiState>({ loading: false });
  const [queryHash, setQueryHash] = useState<string | null>(null);
  const [top, setTop] = useState<PHashMatch[]>([]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetResults = () => {
    setQueryHash(null);
    setTop([]);
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
      setUiState({ loading: false, info: payload.top?.length ? undefined : 'No matches found.' });
    } catch (err) {
      setUiState({ loading: false, error: (err as Error).message });
    }
  };

  const ready = Boolean(selectedFile && !uiState.loading);

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
            </div>
          </div>

          <div className="matches-grid">
            {top.map((m) => {
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

                    <p>pHash distance: <strong>{m.distance}</strong></p>

                    <p>Price: <strong>{fmtMoney(d?.price ?? null)}</strong></p>
                    <p>
                      Beds/Baths: <strong>{d?.beds ?? '—'}</strong> / <strong>{d?.baths ?? '—'}</strong>
                    </p>
                    <p>Sqft: <strong>{fmtNum(d?.sqft ?? null)}</strong></p>

                    {d?.listingUrl ? (
                      <a className="primary ghost" href={d.listingUrl} target="_blank" rel="noreferrer">
                        View listing
                      </a>
                    ) : (
                      <button type="button" className="primary ghost" disabled>
                        View listing
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
