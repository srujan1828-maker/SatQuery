# SatQuery — Backend API (Render)
### Smart India Hackathon 2026 | Problem Statement 26167

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python)](https://www.python.org)
[![STAC](https://img.shields.io/badge/STAC-Planetary_Computer-0078D4?style=flat)](https://planetarycomputer.microsoft.com)

The core API backend for **SatQuery**, providing automated ESA Sentinel-2 and Sentinel-1 satellite imagery acquisition, cloud AI model integration (GeoChat-7B / Google Gemini Multimodal Vision), and Contract B compliant endpoints.

---

## Features

- **Automated STAC & Tile Acquisition**:
  - Point-geometry intersects STAC searches over Microsoft Planetary Computer Sentinel-2 L2A collection.
  - Generates high-resolution `@2x` True Color (visual RGB) tiles without requiring API tokens.
  - Pre-verifies tile accessibility so out-of-bound or corrupted granules are automatically skipped.
  - Multi-tier cloud cover relaxation (tests `< 30%`, `< 60%`, then lowest available cloud cover).
- **Vision-Language AI Integration**:
  - **GeoChat-7B (Contract A)**: Multi-part form `/infer` caller with normalized bounding box coordinate extraction (`[ymin, xmin, ymax, xmax]`).
  - **Google Gemini Multimodal Vision**: Native cloud multimodal vision reasoning over real Sentinel raster bytes via `GEMINI_API_KEY`.
  - **Domain Heuristic Fallback**: 100% resilient analytical fallback ensuring zero 500 crashes during evaluation.
- **High-Performance Image Proxy (`/media/sentinel.png`)**:
  - Ingests, proxies, and caches upstream satellite tiles with permissive CORS for seamless browser rendering.

---

## API Endpoints

- `GET /health` — Service health check
- `POST /api/query` — Main query endpoint (VQA, Change Detection, Sensor Fusion)
- `GET /media/sentinel.png?source={tile_url}` — Satellite tile image proxy

---

## Running Locally

```bash
# Install dependencies
pip install fastapi uvicorn httpx pydantic python-dotenv pytest

# (Optional) Copy .env.example to .env
cp .env.example .env

# Run unit tests
python -m pytest

# Run backend locally
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

## Deployment (Render)

1. Connect this repository to **Render** as a **Web Service**.
2. **Runtime**: Python 3 (or Docker)
3. **Build Command**: `pip install -r requirements.txt` (or `pip install fastapi uvicorn httpx pydantic python-dotenv`)
4. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables**:
   - `GEOCHAT_ENDPOINT_URL`: Your Cloudflare tunnel URL to the Kaggle GeoChat server.
   - `GEMINI_API_KEY`: *(Optional)* Your Google Gemini API key.
