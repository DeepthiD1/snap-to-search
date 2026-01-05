"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
require("./App.css");
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
function App() {
    const sessionId = (0, react_1.useMemo)(() => self.crypto.randomUUID(), []);
    const uploadInputRef = (0, react_1.useRef)(null);
    const captureInputRef = (0, react_1.useRef)(null);
    const [selectedFile, setSelectedFile] = (0, react_1.useState)(null);
    const [previewUrl, setPreviewUrl] = (0, react_1.useState)(null);
    const [location, setLocation] = (0, react_1.useState)(null);
    const [locationStatus, setLocationStatus] = (0, react_1.useState)('Location not requested');
    const [uiState, setUiState] = (0, react_1.useState)({ loading: false });
    const [matches, setMatches] = (0, react_1.useState)([]);
    const [candidateCount, setCandidateCount] = (0, react_1.useState)(null);
    const [responseStatus, setResponseStatus] = (0, react_1.useState)(null);
    const [nextActionToken, setNextActionToken] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);
    const handleFileSelection = (file) => {
        if (!file) {
            return;
        }
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl((prev) => {
            if (prev)
                URL.revokeObjectURL(prev);
            return url;
        });
        setMatches([]);
        setCandidateCount(null);
        setResponseStatus(null);
        setNextActionToken(null);
        setUiState({ loading: false });
    };
    const requestLocation = () => {
        if (!navigator.geolocation) {
            setLocationStatus('Geolocation is not supported in this browser');
            return;
        }
        setLocationStatus('Locking location...');
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setLocation({ latitude, longitude, accuracyMeters: accuracy });
            setLocationStatus(`Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(5)} (+/-${Math.round(accuracy)} m)`);
        }, (error) => {
            setLocationStatus(error.message);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
        });
    };
    const handleSubmit = async () => {
        if (!selectedFile || !location) {
            return;
        }
        setUiState({ loading: true });
        setMatches([]);
        setCandidateCount(null);
        setResponseStatus(null);
        try {
            const formData = new FormData();
            formData.append('photo', selectedFile, selectedFile.name || 'photo.jpg');
            formData.append('sessionId', sessionId);
            formData.append('deviceLatitude', String(location.latitude));
            formData.append('deviceLongitude', String(location.longitude));
            formData.append('deviceAccuracyMeters', String(location.accuracyMeters));
            const response = await fetch(`${API_BASE_URL}/api/snap-to-search`, {
                method: 'POST',
                body: formData,
            });
            const payload = (await response.json());
            if (!response.ok) {
                throw new Error(payload.error ?? 'Failed to run search');
            }
            updateResults(payload);
        }
        catch (error) {
            setUiState({ loading: false, error: error.message });
        }
    };
    const handleExpand = async () => {
        if (!nextActionToken) {
            return;
        }
        setUiState({ loading: true, info: 'Expanding search radius...' });
        try {
            const response = await fetch(`${API_BASE_URL}/api/snap-to-search/${nextActionToken}/expand`, {
                method: 'POST',
            });
            const payload = (await response.json());
            if (!response.ok) {
                throw new Error(payload.error ?? 'Failed to expand search');
            }
            updateResults(payload);
        }
        catch (error) {
            setUiState({ loading: false, error: error.message });
        }
    };
    const updateResults = (payload) => {
        setMatches(payload.matches ?? []);
        setCandidateCount(payload.candidateCount ?? null);
        setResponseStatus(payload.status);
        setNextActionToken(payload.nextActionToken ?? null);
        setUiState({ loading: false, info: payload.status === 'expanded' ? 'Search radius expanded' : undefined });
    };
    const readyToSubmit = Boolean(selectedFile && location && !uiState.loading);
    return ((0, jsx_runtime_1.jsxs)("main", { className: "app-shell", children: [(0, jsx_runtime_1.jsxs)("header", { children: [(0, jsx_runtime_1.jsx)("h1", { children: "Snap-to-Search" }), (0, jsx_runtime_1.jsx)("p", { children: "Take or upload a facade photo to find the exact property nearby." })] }), (0, jsx_runtime_1.jsxs)("section", { className: "capture-panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "button-row", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => captureInputRef.current?.click(), className: "primary", children: "Capture Image" }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: () => uploadInputRef.current?.click(), className: "secondary", children: "Upload Image" })] }), (0, jsx_runtime_1.jsx)("input", { ref: captureInputRef, type: "file", accept: "image/*", capture: "environment", hidden: true, onChange: (event) => handleFileSelection(event.target.files?.[0] ?? null) }), (0, jsx_runtime_1.jsx)("input", { ref: uploadInputRef, type: "file", accept: "image/*", hidden: true, onChange: (event) => handleFileSelection(event.target.files?.[0] ?? null) }), previewUrl ? ((0, jsx_runtime_1.jsxs)("div", { className: "preview-card", children: [(0, jsx_runtime_1.jsx)("img", { src: previewUrl, alt: "Selected home" }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Selected photo" }), (0, jsx_runtime_1.jsx)("p", { children: selectedFile?.name ?? 'Captured photo' }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "text", onClick: () => handleFileSelection(null), children: "Remove photo" })] })] })) : ((0, jsx_runtime_1.jsx)("p", { className: "placeholder", children: "No photo selected yet." })), (0, jsx_runtime_1.jsxs)("div", { className: "location-panel", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("strong", { children: "Device location" }), (0, jsx_runtime_1.jsx)("p", { children: locationStatus })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", onClick: requestLocation, className: "tertiary", children: "Use device location" })] }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "cta", disabled: !readyToSubmit, onClick: handleSubmit, children: uiState.loading ? 'Searching...' : 'Find this home' }), uiState.error && (0, jsx_runtime_1.jsx)("p", { className: "error", children: uiState.error }), uiState.info && (0, jsx_runtime_1.jsx)("p", { className: "info", children: uiState.info })] }), matches.length > 0 && ((0, jsx_runtime_1.jsxs)("section", { className: "results-panel", children: [(0, jsx_runtime_1.jsxs)("div", { className: "results-header", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { children: "Top matches" }), candidateCount !== null && (0, jsx_runtime_1.jsxs)("p", { children: [candidateCount, " homes checked nearby."] })] }), responseStatus && (0, jsx_runtime_1.jsx)("span", { className: "status-pill", children: responseStatus })] }), (0, jsx_runtime_1.jsx)("div", { className: "matches-grid", children: matches.map((match) => ((0, jsx_runtime_1.jsxs)("article", { className: "match-card", children: [(0, jsx_runtime_1.jsx)("img", { src: match.previewImageUrl, alt: match.addressLine }), (0, jsx_runtime_1.jsxs)("div", { className: "match-body", children: [(0, jsx_runtime_1.jsx)("h3", { children: match.addressLine }), (0, jsx_runtime_1.jsxs)("p", { children: [match.distanceMeters, " m away - Confidence:", ' ', (0, jsx_runtime_1.jsx)("strong", { children: match.confidenceLabel.replace('_', ' ') })] }), (0, jsx_runtime_1.jsx)("ul", { children: match.reasons.slice(0, 3).map((reason) => ((0, jsx_runtime_1.jsx)("li", { children: reason }, reason))) }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "primary ghost", children: "View listing" })] })] }, match.propertyId))) }), (0, jsx_runtime_1.jsxs)("div", { className: "results-actions", children: [(0, jsx_runtime_1.jsx)("button", { type: "button", className: "secondary", onClick: handleExpand, disabled: !nextActionToken || uiState.loading, children: "Not this - expand radius" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "tertiary", onClick: () => window.location.reload(), children: "Start over" })] })] }))] }));
}
exports.default = App;
//# sourceMappingURL=App.js.map