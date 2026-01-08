import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type PHashMatch = {
  listingId: string;
  filename: string;
  hash: string;
  distance: number;
  previewImageUrl: string; // backend sends absolute URL
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

function App() {
  useMemo(() => self.crypto.randomUUID(), []); // keep if you want; unused for pHash-only
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

      // IMPORTANT: relative URL (works via vite proxy)
      const response = await fetch('/api/phash-test', {
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
        <p>pHash prototype: upload a photo and get top-5 closest matches from the downloaded MLS images.</p>
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
              <h2>Top pHash matches</h2>
              {queryHash && <p>Query hash: {queryHash}</p>}
            </div>
          </div>

          <div className="matches-grid">
            {top.map((m) => (
              <article key={m.listingId} className="match-card">
                <img src={m.previewImageUrl} alt={m.listingId} />
                <div className="match-body">
                  <h3>{m.listingId}</h3>
                  <p>
                    Distance: <strong>{m.distance}</strong>
                  </p>
                  <p className="muted">hash: {m.hash}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
