import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { RankedMatchResult, SearchResponsePayload } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';


interface UiState {
  loading: boolean;
  error?: string;
  info?: string;
}
interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}


function App() {
  const sessionId = useMemo(() => self.crypto.randomUUID(), []);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [deviceLocation, setDeviceLocation] = useState<DeviceLocation | null>(null);


  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uiState, setUiState] = useState<UiState>({ loading: false });
  const [matches, setMatches] = useState<RankedMatchResult[]>([]);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [responseStatus, setResponseStatus] = useState<SearchResponsePayload['status'] | null>(null);
  const [nextActionToken, setNextActionToken] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const resetResults = () => {
    setMatches([]);
    setCandidateCount(null);
    setResponseStatus(null);
    setNextActionToken(null);
  };

  const handleFileSelection = (file: File | null) => {
    resetResults();
    setUiState({ loading: false });

    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
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
  const getDeviceLocation = () =>
  new Promise<DeviceLocation>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy ?? 50,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });


  const handleSubmit = async () => {
    if (!selectedFile) {
      return;
    }

    setMatches([]);
    setCandidateCount(null);
    setResponseStatus(null);
    setNextActionToken(null);
    setUiState({ loading: true, info: 'Comparing photo with dataset...' });

    try {
      let loc = deviceLocation;

if (!loc) {
  setUiState({ loading: true, info: 'Getting your location…' });
  try {
    loc = await getDeviceLocation();
    setDeviceLocation(loc);
    setUiState({ loading: true, info: 'Comparing photo with listings…' });

  } catch {
    setUiState({ loading: false, error: 'Please allow location access so we can search nearby listings.' });
    return;
  }
}

      const formData = new FormData();
      formData.append('photo', selectedFile, selectedFile.name || 'photo.jpg');
      formData.append('sessionId', sessionId);
      formData.append('deviceLatitude', String(loc.latitude));
formData.append('deviceLongitude', String(loc.longitude));
formData.append('deviceAccuracyMeters', String(loc.accuracyMeters));


      const response = await fetch(`${API_BASE_URL}/api/snap-to-search`, {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as SearchResponsePayload & { nextActionToken?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to run search');
      }

      updateResults(payload);
    } catch (error) {
      setUiState({ loading: false, error: (error as Error).message });
    }
  };

  const handleExpand = async () => {
    if (!nextActionToken) {
      return;
    }
    setUiState({ loading: true, info: 'Re-scoring larger candidate set...' });
    try {
      const response = await fetch(`${API_BASE_URL}/api/snap-to-search/${nextActionToken}/expand`, {
        method: 'POST',
      });
      const payload = (await response.json()) as SearchResponsePayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to expand search');
      }
      updateResults(payload);
    } catch (error) {
      setUiState({ loading: false, error: (error as Error).message });
    }
  };

  const updateResults = (payload: SearchResponsePayload & { nextActionToken?: string }) => {
    setMatches(payload.matches ?? []);
    setCandidateCount(payload.candidateCount ?? null);
    setResponseStatus(payload.status);
    setNextActionToken(payload.nextActionToken ?? null);
    setUiState({
      loading: false,
      info: payload.status === 'expanded' ? 'Expanded dataset search applied' : undefined,
    });
  };

  const readyToSubmit = Boolean(selectedFile && !uiState.loading);

  return (
    <main className="app-shell">
      <header>
        <h1>Snap-to-Search</h1>
        <p>Upload a facade photo and we will compare it against our sample CSV dataset.</p>
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
          onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
        />

        {previewUrl ? (
          <div className="preview-card">
            <img src={previewUrl} alt="Selected home" />
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

        <p className="hint">
          This prototype only uses the uploaded photo and the CSV-backed gallery - no device or IP location data is
          collected.
        </p>

        <button type="button" className="cta" disabled={!readyToSubmit} onClick={handleSubmit}>
          {uiState.loading ? 'Searching...' : 'Find this home'}
        </button>
        {uiState.error && <p className="error">{uiState.error}</p>}
        {uiState.info && <p className="info">{uiState.info}</p>}
      </section>

      {matches.length > 0 && (
        <section className="results-panel">
          <div className="results-header">
            <div>
              <h2>Top matches</h2>
              {candidateCount !== null && <p>{candidateCount} homes checked in the dataset.</p>}
            </div>
            {responseStatus && <span className="status-pill">{responseStatus}</span>}
          </div>

          <div className="matches-grid">
            {matches.map((match) => (
              <article key={match.propertyId} className="match-card">
                <img src={match.previewImageUrl} alt={match.addressLine} />
                <div className="match-body">
                  <h3>{match.addressLine}</h3>
                  <p>
                    Confidence: <strong>{match.confidenceLabel.replace('_', ' ')}</strong>
                  </p>
                  <ul>
                    {match.reasons.slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <button type="button" className="primary ghost">
                    View listing
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="results-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleExpand}
              disabled={!nextActionToken || uiState.loading}
            >
              Not this - expand dataset
            </button>
            <button type="button" className="tertiary" onClick={() => window.location.reload()}>
              Start over
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
