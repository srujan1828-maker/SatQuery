# SatQuery — Frontend (Vercel)
### Smart India Hackathon 2026 | Problem Statement 26167

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=flat&logo=leaflet)](https://leafletjs.com)

The geospatial user interface for **SatQuery**, the Satellite Vision-Language Assistant. Built with React 19, Vite, and Leaflet, adhering to a high-contrast dark intelligence console design system.

---

## Features

- **Live Geospatial Targeting (`InteractiveMap.jsx`)**:
  - Live satellite basemap (Esri World Imagery) and Tactical Dark Matter layers.
  - Interactive radar reticle: click or drag to pinpoint observation coordinates.
  - Reverse geocoding & location search bar (with coordinates and city names).
  - SIH Demo Presets: New Delhi, Kedarnath, Brahmaputra Basin, Chilika Lake, Suez Canal, Mumbai Port.
- **Change Detection Swipe Divider (`ComparisonSlider.jsx`)**:
  - GPU-accelerated horizontal swipe divider using CSS `clip-path` for zero image distortion.
  - Side-by-side or split slider views with synchronized bounding boxes.
- **Sensor Fusion Inspector (`FusionInspector.jsx`)**:
  - Cross-fade opacity slider between Sentinel-2 optical imagery and Sentinel-1 SAR microwave radar.
- **Query Console (`QueryPanel.jsx`)**:
  - Query suggestion chips tailored to VQA, Change Detection, and Multi-sensor Fusion.
  - Seamless coordinate synchronization with the interactive map.

---

## Setup & Running Locally

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev -- --host 127.0.0.1 --port 5173

# Build for production
npm run build

# Run linter
npm run lint
```

---

## Deployment (Vercel)

1. Connect this repository to **Vercel**.
2. **Framework Preset**: `Vite`
3. **Root Directory**: `frontend` (if deploying from root, select `frontend`).
4. **Environment Variables**:
   - `VITE_API_BASE_URL`: The URL of your deployed Render backend (e.g. `https://satquery.onrender.com`).
