# SatQuery: Comprehensive QA Test Suite & Verification Guide

This document defines the complete Quality Assurance (QA) test plan, automated test suites, and 29 end-to-end manual test cases for the **SatQuery** satellite intelligence platform.

---

## 1. Quick Automated Test Commands

### Backend Automated Test Suite (FastAPI + Pytest)
```powershell
# Navigate to backend directory and run test suite
cd d:\SATQuery\backend
python -m pytest tests/ -v
```
**Expected Result**: All 15 automated test cases pass (HTTP contract validation, date range bounds, Sentinel-2/Sentinel-1 tile coordinate mathematics, autocomplete geocode endpoint, and cache fallbacks).

### Frontend Production Build Test (Vite + React)
```powershell
# Navigate to frontend directory and run production build
cd d:\SATQuery\frontend
npm run build
```
**Expected Result**: Vite compiles all 32 modules with 0 errors and creates the production distribution in `dist/`.

### Run Local Development Servers
```powershell
# Terminal 1: Backend Server (Port 8000)
cd d:\SATQuery\backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: Frontend Server (Port 5173)
cd d:\SATQuery\frontend
npm run dev
```
**Expected Result**: Frontend is accessible at `http://localhost:5173` and communicates with the backend API at `http://127.0.0.1:8000`.

---

## 2. End-to-End Test Matrix & Manual Test Cases

| Test ID | Feature Area | Description | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Geospatial Map | Leaflet Map Initialization & Rendering | Dark/Satellite basemap loads smoothly without container re-init errors. | Pass |
| **TC-02** | Geospatial Map | Reticle Pin Dragging & Map Click | Clicking map or dragging reticle pin updates Latitude & Longitude inputs. | Pass |
| **TC-03** | Geospatial Map | Basemap Layer Switcher | Toggle between Satellite (Esri), Tactical (Carto Dark), and Street (OSM). | Pass |
| **TC-04** | Geospatial Map | SIH Preset Quick Jumps | Clicking "Kedarnath", "New Delhi", "Brahmaputra" pans map with zoom 13. | Pass |
| **TC-05** | Autocomplete | Preset Keyword Suggestions | Typing `"delhi"` in search bar shows instant preset suggestion dropdown. | Pass |
| **TC-06** | Autocomplete | Coordinate Regex Parsing | Typing `"30.7346, 79.0669"` shows "Direct Coordinate Target" suggestion. | Pass |
| **TC-07** | Autocomplete | Global Nominatim Geocoding | Typing `"London"`, `"Tokyo"`, or `"Suez"` fetches real-time suggestions. | Pass |
| **TC-08** | Autocomplete | Keyboard Navigation (`↑` / `↓` / `Enter` / `Esc`) | Arrow keys highlight items, Enter selects, Escape closes dropdown. | Pass |
| **TC-09** | Autocomplete | Click-Outside Dismiss | Clicking outside the search bar dismisses the autocomplete popup. | Pass |
| **TC-10** | URL Parameter Sync | Real-Time Query Parameter Sync | Moving pin/selecting location updates address bar `?lat=...&lon=...&loc=...`. | Pass |
| **TC-11** | URL Parameter Sync | Deep Linking & Load State Hydration | Opening URL with `?lat=30.73&lon=79.06&loc=Kedarnath` pre-fills all fields. | Pass |
| **TC-12** | URL Parameter Sync | Browser Back/Forward Navigation | Browser back/forward navigation preserves geospatial parameters. | Pass |
| **TC-13** | Mode 1: VQA | Single Observation Querying | Querying Sentinel-2 optical scene returns answer text and image. | Pass |
| **TC-14** | Mode 1: VQA | Suggestion Chips Insertion | Clicking suggestion chips (e.g. "+ Detect surface water") fills query textarea. | Pass |
| **TC-15** | Mode 1: VQA | AI Bounding Box Overlays | Detected target features are bounded with cyan bounding boxes. | Pass |
| **TC-16** | Mode 1: VQA | Multilingual Support | Switching language to Hindi returns responses in Hindi script. | Pass |
| **TC-17** | Mode 2: Change Detection | Dual Date Range Selection | Baseline and Observation dates are selectable and validated. | Pass |
| **TC-18** | Mode 2: Change Detection | Synchronized Dual-Scene Query | Returns Before and After Sentinel-2 optical scenes over same bounding box. | Pass |
| **TC-19** | Mode 2: Change Detection | Interactive Comparison Slider | Horizontal slider reveals before/after changes with clip-path wipe. | Pass |
| **TC-20** | Mode 2: Change Detection | Temporal Change Summary | Detailed narrative summary explaining spectral differences and changes. | Pass |
| **TC-21** | Mode 3: Sensor Fusion | Multimodal Optical + Radar Query | Returns Sentinel-2 Optical RGB and Sentinel-1 SAR VV radar tiles. | Pass |
| **TC-22** | Mode 3: Sensor Fusion | Split Swipe Mode | Vertical wipe slider separates optical (left) and radar (right). | Pass |
| **TC-23** | Mode 3: Sensor Fusion | Opacity Blend Mode & Presets | Slider blends optical/radar continuously; "Optical", "50/50", "Radar" work. | Pass |
| **TC-24** | Mode 3: Sensor Fusion | Side-by-Side Mode | Dual-column layout renders synchronized optical and radar panels. | Pass |
| **TC-25** | Mode 3: Sensor Fusion | False-Color Composite Mode | Blends microwave dielectric backscatter with optical surface reflectance. | Pass |
| **TC-26** | Mode 3: Sensor Fusion | Remote Sensing Metadata Cards | Displays technical cards (S2 MSI 10m RGB vs S1 SAR C-band 5.405 GHz). | Pass |
| **TC-27** | Resilience & Reliability | Cloud Cover Search Widening | Low-cloud search widens up to ±180 days so imagery is never broken. | Pass |
| **TC-28** | Resilience & Reliability | Graceful Service Degradation | If GeoChat cold-starts, Gemini fallback or local cache delivers answer. | Pass |
| **TC-29** | Honesty & Safety | Confidence Indicator & Uncertainty Notice | High / Medium / Uncertain flags displayed with calibration notices. | Pass |

---

## 3. Detailed Step-by-Step Test Scenarios

### Test Scenario A: Location Autocomplete & Google Maps URL Sync
1. Open `http://localhost:5173`.
2. Observe the search bar in the Interactive Map toolbar.
3. Type `"ked"` into the search box.
4. **Verify**: A dropdown appears showing `"Kedarnath"`, category badge `Himalayan Glacial & Flash Flood Risk`, and coordinates `30.7346°N, 79.0669°E`.
5. Press the `Down Arrow` key to highlight the suggestion and press `Enter`.
6. **Verify**:
   - The map flies smoothly to Kedarnath (Latitude: `30.7346`, Longitude: `79.0669`).
   - The Latitude and Longitude input fields update to `30.7346` and `79.0669`.
   - The browser URL bar updates to `http://localhost:5173/?lat=30.7346&lon=79.0669&loc=Kedarnath`.
7. Refresh the browser page (`F5`).
8. **Verify**: The map and form inputs retain `30.7346`, `79.0669`, and `Kedarnath` directly from the URL.

---

### Test Scenario B: Multimodal Optical + SAR Radar Sensor Fusion
1. Click the **"Sensor Fusion"** tab in the top navigation switcher.
2. In the Query Console:
   - Target Location: `"New Delhi"` (or click the `"New Delhi"` preset on the map).
   - Date: Select `"2024-05-12"`.
   - Question: Click the suggestion `"+ Detect flood extent and standing water by fusing optical and SAR radar."`.
3. Click **"Analyze Sensor Fusion"**.
4. **Verify**:
   - Loading scanner overlay pulses with `"Aligning Sentinel-2 Optical and Sentinel-1 SAR Radar Swaths..."`.
   - Two pixel-aligned tiles are rendered at zoom 14:
     - **Sentinel-2 Optical (MSI RGB)**
     - **Sentinel-1 SAR Radar (C-Band VV Polarization)**
   - The **Split Swipe** view is active by default. Drag the circular divider handle left and right to inspect terrain vs radar backscatter.
   - Click the **"Opacity Blend"** tab. Move the slider from 0% to 100% or click `"50/50"`.
   - Click the **"Side-by-Side"** tab to compare both swaths synchronously.
   - Click the **"Color Composite"** tab to view the false-color fusion.
   - Review the bottom **Remote Sensing Metadata Cards** explaining optical vs radar physics.

---

### Test Scenario C: Multi-Temporal Change Detection
1. Click the **"Change Detection"** tab.
2. Select Preset `"Kedarnath"`.
3. Set **Baseline Date**: `2023-05-12` and **Observation Date**: `2024-05-12`.
4. Click `"+ Detect surface water expansion and flood inundation changes."`.
5. Click **"Detect Temporal Change"**.
6. **Verify**:
   - Interactive Before & After comparison slider renders both dates.
   - Dragging the handle reveals physical differences between 2023 and 2024.
   - Change Summary panel describes the spectral evolution over time.

---

### Test Scenario D: Visual Question Answering (VQA)
1. Click the **"Visual Question Answering"** tab.
2. Target Preset `"Chilika Lake"` (`19.7165°N, 85.3214°E`).
3. Set Date: `2024-05-12`.
4. Query: `"Detect coastal wetland boundary and water bodies."`.
5. Click **"Ask SatQuery"**.
6. **Verify**:
   - Returns Sentinel-2 MSI true-color image.
   - AI bounding boxes appear over detected surface water and lagoon zones.
   - Toggle button `"Show Boxes"` / `"Hide Boxes"` shows and hides the bounding overlays.
   - Answer panel details lagoon geography with confidence level pill.
