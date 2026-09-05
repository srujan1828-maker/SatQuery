# SatQuery — Satellite Vision-Language Assistant
### Smart India Hackathon 2026 | Problem Statement 26167

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=flat&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Bundler-Vite_8-646CFF?style=flat&logo=vite)](https://vitejs.dev)
[![Leaflet](https://img.shields.io/badge/GIS-Leaflet-199900?style=flat&logo=leaflet)](https://leafletjs.com)
[![ESA Sentinel](https://img.shields.io/badge/Data-ESA_Sentinel--2_%26_Sentinel--1-003399?style=flat)](https://sentinels.copernicus.eu)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> **SatQuery** is an AI-powered Earth Observation and Satellite Remote Sensing Vision-Language Assistant. It enables users, disaster management authorities, and researchers to query live satellite imagery using natural language (English and Hindi), inspect multi-temporal change detection, and explore optical-radar sensor fusion.

---

## Key Highlights

- **Live Geospatial Targeting**: Interactive Leaflet satellite map powered by high-resolution Esri World Imagery with pinpoint targeting, geocoding search, and SIH demo presets.
- **ESA Sentinel-2 & Sentinel-1 Ingestion**: Automated STAC search and tile retrieval via Microsoft Planetary Computer Data API with zero credential requirements.
- **Vision-Language AI Integration**:
  - **GeoChat-7B**: Contract A `/infer` endpoint on Kaggle/Cloudflare Tunnel with normalized bounding boxes (`[ymin, xmin, ymax, xmax]`).
  - **Google Gemini Multimodal Vision API**: Instant cloud Vision-Language reasoning over real satellite raster scenes.
  - **Graceful Heuristic Fallback**: Zero-crash reliability during live evaluation demonstrations.
- **Interactive Change Detection Swipe Slider**: Draggable horizontal comparison divider using GPU-accelerated CSS `clip-path` to contrast surface change between baseline and observation dates.
- **Optical vs. SAR Radar Fusion Inspector**: Opacity cross-fade blend slider demonstrating how Sentinel-1 Synthetic Aperture Radar (SAR C-band microwave) penetrates cloud cover and pinpoints flood water bodies.

---

## System Architecture

```
                                  +---------------------------------------+
                                  |            User / Browser             |
                                  |     (React 19 + Vite + Leaflet)       |
                                  +-------------------+-------------------+
                                                      |
                                             REST API | POST /api/query
                                                      v
                                  +---------------------------------------+
                                  |            SatQuery Backend           |
                                  |           (FastAPI on Render)         |
                                  +---------+-------------------+---------+
                                            |                   |
                        STAC Search & Tiles |                   | Cloud AI Model
                                            v                   v
+-------------------------------------------+-----+   +---------------------------------------+
|        Microsoft Planetary Computer             |   |        Vision-Language Models         |
|  - Sentinel-2 L2A (10m Optical RGB surface)     |   |  - GeoChat-7B (Cloudflare Tunnel)     |
|  - Sentinel-1 GRD (SAR Microwave Radar)         |   |  - Google Gemini 1.5 Flash Vision     |
+-------------------------------------------------+   +---------------------------------------+
```

---

## Core Capabilities

### 1. Visual Question Answering (VQA)
Ask questions about geographical features, surface water extent, vegetation health, and urban infrastructure. The model responds with factual analysis and grounded bounding box overlays.

### 2. Multi-Temporal Change Detection
Specify a target coordinate and a date range (`start_date` to `end_date`). SatQuery fetches the clearest before and after Sentinel-2 scenes, calculates temporal differences, and renders an interactive swipe comparison tool.

### 3. Multimodal Optical + Radar Sensor Fusion
Demonstrates why optical imagery alone is insufficient during disaster scenarios (e.g. monsoon flooding with heavy cloud cover). Sentinel-1 C-band SAR radar penetrates clouds, revealing standing water through specular backscatter attenuation.

---

## Project Structure

```
SATQuery/
├── SatQuery-codex-fix-imagery-model-unavailability-issue/  # BACKEND (Render)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI application & image proxy
│   │   ├── models.py        # Pydantic schemas (Contracts A & B)
│   │   └── services.py      # STAC search, tile engine, GeoChat/Gemini integration
│   ├── tests/
│   │   └── test_api.py      # Unit tests (pytest)
│   ├── Dockerfile           # Production container configuration
│   └── pyproject.toml       # Python dependencies
│
├── SatQuery-codex-check-frontend-query-to-backend/         # FRONTEND (Vercel)
│   └── frontend/
│       ├── src/
│       │   ├── api/
│       │   │   └── query.js               # Contract B API client
│       │   ├── components/
│       │   │   ├── InteractiveMap.jsx     # Leaflet satellite map & presets
│       │   │   ├── ComparisonSlider.jsx   # Before/After swipe divider
│       │   │   ├── FusionInspector.jsx    # Optical vs SAR radar blend tool
│       │   │   ├── ImageViewer.jsx        # Image viewer with bounding boxes
│       │   │   ├── QueryPanel.jsx         # Query form & suggestion chips
│       │   │   └── HonestyPanel.jsx       # Scope, capabilities & limitations
│       │   ├── App.jsx                    # Main application shell
│       │   └── main.jsx                   # React root entry
│       ├── package.json
│       └── vite.config.js
└── README.md
```

---

## API Specification

### Contract B — Main Query Endpoint
**`POST /api/query`**

#### Request Payload
```json
{
  "query": "Identify all surface water bodies and active vegetation.",
  "language": "en",
  "location": {
    "lat": 28.6139,
    "lon": 77.2090,
    "name": "New Delhi"
  },
  "date": "2024-05-12",
  "mode": "vqa"
}
```

#### Response Payload (200 OK)
```json
{
  "mode": "vqa",
  "answer_text": "Sentinel-2 L2A optical surface reflectance captured on 2024-05-13 over New Delhi shows distinct terrain patterns, surface water boundaries, and regional vegetation distribution.",
  "images": [
    {
      "id": "vqa_scene",
      "url": "/media/sentinel.png?source=https%3A%2F%2Fplanetarycomputer.microsoft.com...",
      "sensor": "sentinel-2",
      "date": "2024-05-13",
      "role": "single"
    }
  ],
  "overlay_boxes": [
    {
      "image_id": "vqa_scene",
      "label": "surface water / terrain",
      "x_min": 0.22,
      "y_min": 0.25,
      "x_max": 0.74,
      "y_max": 0.72,
      "confidence": 0.78
    }
  ],
  "change_summary": null,
  "confidence_flag": "high",
  "used_cache_fallback": false,
  "error": null
}
```

---

## Local Development & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### 1. Backend Setup
```bash
cd SatQuery-codex-fix-imagery-model-unavailability-issue

# Install dependencies (or use pip/uv)
pip install fastapi uvicorn httpx pydantic python-dotenv pytest

# (Optional) Copy .env.example to .env and configure model endpoints
cp .env.example .env

# Run unit tests
python -m pytest

# Start local backend server (runs on http://127.0.0.1:8000)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd SatQuery-codex-check-frontend-query-to-backend/frontend

# Install dependencies
npm install

# Start local dev server (runs on http://127.0.0.1:5173)
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## Deployment Guide

### Deploy Backend to Render
1. Create a **New Web Service** on [Render](https://render.com).
2. Connect your backend GitHub repository (or specify `SatQuery-codex-fix-imagery-model-unavailability-issue` as Root Directory).
3. **Build Command**: `pip install -r requirements.txt` (or Docker)
4. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables**:
   - `GEOCHAT_ENDPOINT_URL`: Your Cloudflare tunnel URL to the Kaggle GeoChat server.
   - `GEMINI_API_KEY`: *(Optional)* Your Google Gemini API key for instant cloud vision reasoning.

### Deploy Frontend to Vercel
1. Create a **New Project** on [Vercel](https://vercel.com).
2. Connect your frontend GitHub repository (or select `SatQuery-codex-check-frontend-query-to-backend`).
3. Set **Framework Preset**: `Vite`
4. Set **Root Directory**: `frontend` (if deploying from frontend subfolder).
5. **Environment Variables**:
   - `VITE_API_BASE_URL`: Your Render backend deployment URL (e.g. `https://satquery.onrender.com`).

---

## Smart India Hackathon Scenarios (SIH Presets)

The interface includes one-click demonstration scenarios designed for SIH evaluators:

| Preset Location | Coordinates | Scenario Focus |
|---|---|---|
| **New Delhi** | 28.6139° N, 77.2090° E | Urban sprawl & Yamuna river hydrological assessment |
| **Kedarnath** | 30.7346° N, 79.0669° E | Himalayan disaster, flash flood & landslide change detection |
| **Brahmaputra Basin** | 26.1856° N, 91.7539° E | Assam monsoon flooding & Sentinel-1 SAR cloud penetration |
| **Chilika Lake** | 19.7165° N, 85.3214° E | Coastal lagoon, brackish wetland & mangrove conservation |
| **Suez Canal** | 30.5852° N, 32.5658° E | Maritime channel bottleneck & vessel grounding inspection |
| **Mumbai Port** | 18.9667° N, 72.8258° E | Arabian Sea coastal reclamation & harbor development |

---

## Authors & Team

Developed for **Smart India Hackathon 2026** — Problem Statement **26167**.
Team Track Split:
- **Track 1**: Vision-Language Model Server (GeoChat-7B / Gemini Multimodal)
- **Track 2**: Satellite Data Pipeline & Integration Backend (FastAPI / Planetary Computer)
- **Track 3**: Geospatial Intelligence Frontend (React 19 / Leaflet / Vite)
