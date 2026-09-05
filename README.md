# Satellite Vision-Language Assistant — Team Build Plan (3 people)

This document is the single source of truth for how the three tracks (AI/Model, Backend, Frontend) integrate. **Nobody should deviate from the data structures in Part 0 without updating this doc and notifying the other two people first** — this is the #1 rule for the whole project. Most integration failures on a split team come from silent drift between what one person built and what another person assumed.

---

# PART 0 — Shared API Contracts (read this before writing any code)

There are two API boundaries in this system. Everyone touches at least one of them.

## Contract A — Kaggle `/infer` endpoint (GeoChat server ↔ Backend)
Owned by Person 1. Consumed by Person 2. Person 3 never calls this directly.

**Request** — `POST {GEOCHAT_ENDPOINT_URL}/infer`, `multipart/form-data`:
| field | type | required | notes |
|---|---|---|---|
| `image` | file (jpg/png) | yes | single image |
| `prompt` | string | yes | natural-language instruction to GeoChat |
| `task` | string enum | no | `"caption"` \| `"vqa"` \| `"grounding"` — defaults to `"vqa"` |

**Response** — `200 OK`, JSON:
```json
{
  "answer": "string — GeoChat's raw text output",
  "boxes": [
    {
      "label": "string",
      "x_min": 0.0,
      "y_min": 0.0,
      "x_max": 0.0,
      "y_max": 0.0,
      "confidence": 0.0
    }
  ],
  "model_confident": true
}
```
**Rules Person 1 must follow:**
- `boxes` coordinates are **normalized 0–1 floats**, relative to image width/height — never raw pixels. Backend and frontend both assume normalized coords; if GeoChat outputs pixel coords, convert before returning.
- `boxes` is `[]` (not null, not omitted) when there's no grounded output.
- `model_confident` is a simple heuristic (e.g. false if GeoChat's output is empty/garbled or hit a length/repetition failure) — doesn't need to be sophisticated, just present.
- On any internal error, return HTTP `500` with `{"error": "message"}` — never let Backend receive an empty response or an HTML error page (FastAPI does this by default if you let exceptions propagate, so wrap `/infer` in try/except).
- Timeout budget: Backend will time out the call at **20 seconds**. If inference regularly takes longer, tell Person 2 so the timeout can be adjusted — don't silently let it fail.

## Contract B — Backend main endpoint (Backend ↔ Frontend)
Owned by Person 2. Consumed by Person 3. This is the **only** endpoint the frontend calls.

**Request** — `POST /api/query`, JSON:
```json
{
  "query": "string — user's free-text question, EN or HI",
  "language": "en",
  "location": { "lat": 0.0, "lon": 0.0, "name": "optional string" },
  "date": "YYYY-MM-DD",
  "date_range": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "mode": "vqa"
}
```
| field | required? |
|---|---|
| `query` | always required |
| `language` | optional — omit and router infers from text |
| `location` | required for `vqa` and `change_detection`, omitted for `fusion_demo` |
| `date` | required for `vqa` only |
| `date_range` | required for `change_detection` only |
| `mode` | optional — if omitted, the router decides; frontend can pass this explicitly for the fusion-demo button so it never depends on router judgment |

**Response** — `200 OK`, JSON:
```json
{
  "mode": "vqa",
  "answer_text": "string — final synthesized natural-language answer",
  "images": [
    {
      "id": "img_1",
      "url": "/media/img_1.png",
      "sensor": "sentinel-2",
      "date": "2026-06-01",
      "role": "single"
    }
  ],
  "overlay_boxes": [
    {
      "image_id": "img_1",
      "label": "string",
      "x_min": 0.0, "y_min": 0.0, "x_max": 0.0, "y_max": 0.0,
      "confidence": 0.0
    }
  ],
  "change_summary": "string or null — only populated when mode is change_detection",
  "confidence_flag": "high",
  "used_cache_fallback": false,
  "error": null
}
```
**Field rules everyone must follow:**
- `mode` is always one of exactly `"vqa"`, `"change_detection"`, `"fusion_demo"` — no other values, ever. Frontend switches its whole view based on this string.
- `images`: 1 entry for `vqa`, 2 entries for `change_detection` (`role`: `"before"` / `"after"`), 2 entries for `fusion_demo` (`role`: `"optical"` / `"radar"`).
- `overlay_boxes` coordinates are the **same normalized 0–1 scheme as Contract A** — do not convert to pixels in the backend. Frontend does the pixel math against actual rendered image dimensions.
- `overlay_boxes[].image_id` must match one of the `images[].id` values — this is how frontend knows which image to draw a box on.
- `confidence_flag` is always present, one of `"high"` / `"medium"` / `"low"` / `"uncertain"` — frontend uses this to decide whether to show the graceful uncertainty state (Section 4 spec). Backend sets `"uncertain"` whenever `model_confident` was false from Contract A, or when a fallback was used.
- `used_cache_fallback: true` **only** applies to `fusion_demo` mode when the live tunnel call failed and cached data was served instead. Frontend does not need to change appearance for this — it's for logging/debugging, not UI.
- On any backend-side failure (GEE fetch fails, router fails, tunnel unreachable and no cache available), respond `200 OK` with a populated `error` object and `answer_text` set to a plain-language explanation — **never send a raw `500` to the frontend for expected failure modes**, since Section 4 requires a graceful UI state, not a broken one:
```json
{ "error": { "code": "geochat_unreachable", "message": "The imagery model is temporarily unavailable." } }
```

## Contract C — Mock response (for parallel development)
Person 2 must publish a static JSON file matching Contract B exactly — one example for each of the 3 modes — into a shared location (repo root `/mocks/`) **on day one**, before any real pipeline code exists. Person 3 builds against this file immediately; swapping the mock for the real endpoint later should require changing only the fetch URL, nothing else.

---

# PART 1 — Person 1: AI / Model (Kaggle + GeoChat + Router)

## Objective
Get GeoChat-7B running and reachable from outside Kaggle, and build the query router that decides which pipeline to invoke.

## Task order
1. **Day 1, first task, no exceptions:** clone `mbzuai-oryx/GeoChat`, download `MBZUAI/geochat-7B` weights, get a single test image to produce a real caption locally in the notebook. Do not move on until this works — this is the highest-risk item in the whole project.
2. Wrap inference in FastAPI per Contract A. Test with `curl` from your own laptop before telling anyone it's ready.
3. Start the Cloudflare Tunnel, confirm the public URL reaches `/infer` from a machine outside Kaggle.
4. Hand the tunnel URL to Person 2 and post it in the shared channel — **every time it changes**, not just once.
5. Build the query router: Gemini API + tool/function calling, 3 tools (`call_vqa`, `call_change_detection`, `call_fusion_demo`), reads `query` (+ `language` if given) and decides which one to call. Router output must map cleanly onto Contract B's `mode` field — literally return one of the three mode strings, nothing else.
6. Support English and Hindi in the same router prompt — no separate translation step or library.
7. Pre-fetch and cache the fusion-demo scenario (image pair + GeoChat output) and hand the cached files to Person 2 for the fallback path.

## Constraints / rules
- **Never** commit the Cloudflare tunnel URL, GEE credentials, or Hugging Face token into the notebook or repo. Clear cell outputs before pushing (`jupyter nbconvert --clear-output`).
- **Never** change Contract A's field names or types without updating Part 0 and notifying Person 2 — this breaks their code silently otherwise.
- Do not attempt to fine-tune or retrain anything — inference only, per the project's Definition of Done.
- Do not build object counting / DOTA detection — out of scope, don't spend time on it even if it looks easy.
- Own tunnel uptime: check it's alive before every session where Person 2 or Person 3 needs to test against it, and definitely before any demo/rehearsal. If it's down, say so proactively rather than letting someone else discover it via a failed request.
- Timeout discipline: know how long `/infer` actually takes under real load and communicate it — Backend's 20s timeout assumption must match reality.

## Definition of done for this track
- [ ] `/infer` matches Contract A exactly, verified by Person 2 with real requests
- [ ] Tunnel reachable and documented as currently-live at any check-in
- [ ] Router correctly returns one of the 3 valid `mode` values for a range of test queries in both English and Hindi
- [ ] Fusion-demo cache files handed off and confirmed working by Person 2

---

# PART 2 — Person 2: Backend + Integration

## Objective
Build everything behind Contract B — the GEE data layer, the three pipelines, the router integration, and the fallback logic — and keep the whole system's contracts honest as things change.

## Task order
1. **Day 1:** publish the Contract C mock files so Person 3 is never blocked. Do this before any real pipeline code.
2. Build `fetch_imagery(location, date, sensor)` — thin wrapper over `earthengine-api`. Confirm one real Sentinel-1 and one real Sentinel-2 fetch before building anything on top of it.
3. Single-image VQA pipeline: `location + date` → `fetch_imagery` → call Contract A `/infer` → shape result into Contract B.
4. Change-detection pipeline: two `fetch_imagery` calls → OpenCV diff → both images (+ diff context) to `/infer` → synthesize `change_summary`.
5. Fusion-demo pipeline: serve Person 1's cached image pair + cached GeoChat output directly — no live GEE or `/infer` call on the happy path. Build the fallback trigger (live call attempted first *only if* a live path is ever added later; for now this can just always serve cache, per Section 6's "pre-fetched and cached" requirement).
6. Wire the router (Person 1's code) into `/api/query`: query comes in → router picks mode → correct pipeline runs → response shaped into Contract B.
7. Build the `used_cache_fallback` / timeout / error-handling paths per Contract B's error rules — test these deliberately (kill the tunnel, watch the response) rather than hoping they never trigger.

## Constraints / rules
- **Never** change Contract B's field names, types, or the fixed `mode` enum without updating Part 0 and notifying Person 3 first.
- Never send a raw `500` for an expected failure (tunnel down, GEE quota, no data for a location) — always populate `error` and a plain-language `answer_text` per Contract B.
- Keys/secrets (`GEMINI_API_KEY`, `GEOCHAT_ENDPOINT_URL`, GEE credentials) live only in `.env`, never hardcoded, never committed.
- Don't build any pipeline beyond the three listed in Section 2 of the project spec, even if GEE makes something else look easy to add.
- Run integration checks continuously, not just at the end: every time Person 1's tunnel URL changes or Person 3 changes something touching the response shape, re-verify the full chain works, don't wait for a big merge at the deadline.

## Definition of done for this track
- [ ] `/api/query` matches Contract B exactly for all 3 modes, verified against real frontend requests
- [ ] All 3 pipelines work end-to-end against Person 1's live tunnel
- [ ] Fusion-demo mode works with zero dependency on the tunnel being up
- [ ] Error/timeout/uncertainty paths tested deliberately, not just assumed to work
- [ ] `.env`/secrets checklist complete, nothing hardcoded

---

# PART 3 — Person 3: Frontend

## Objective
Build the full Section 4 UI, working against the Contract C mock from day one so you're never blocked on Person 1 or Person 2 being finished.

## Task order
1. **Day 1:** pull Person 2's mock JSON files, confirm you can render something — even ugly — from each of the 3 `mode` values before doing any visual design work.
2. Design system: palette, type scale, spacing, corner-radius — decide and document these before building components.
3. Image/map viewer component + bounding-box overlay: read `overlay_boxes` (normalized 0–1 coords per Contract B), convert to pixel positions against the actual rendered image size, draw crisply with legible labels. Filter `overlay_boxes` by matching `image_id` to the currently-displayed image.
4. Chat/query panel: constructs the Contract B request body, calls `/api/query` (swap the mock URL for the real one only when Person 2 confirms it's live — nothing else in your code should need to change).
5. Results/annotation panel: renders `answer_text`, and shows the graceful uncertainty state whenever `confidence_flag` is `"low"` or `"uncertain"`, or `error` is non-null.
6. Change-comparison view: renders when `mode === "change_detection"` — before/after images (`role: "before"`/`"after"`) plus `change_summary`.
7. Fusion-demo guided narrative: renders when `mode === "fusion_demo"` — optical image (`role: "optical"`) → radar image (`role: "radar"`) → `answer_text` as the takeaway.
8. Landing/empty state + the "what this does/doesn't do" honesty panel (static content, no API dependency — build any time).
9. Loading/skeleton states, responsive pass, final polish pass.

## Constraints / rules
- **Never** assume a field exists that isn't in Contract B — if you need something the backend doesn't return, that's a Part 0 change request to raise with Person 2, not something to work around locally.
- Bounding box math must use **actual rendered image dimensions at render time**, not the image's natural/original size — this is the most common source of "boxes look right in dev, wrong on other screens" bugs.
- No default unstyled `<button>`/`<input>`, no generic centered-card layout, no purple-gradient-on-white — per Section 4's explicit anti-template requirements.
- Don't build features not in Section 2's "Build" list (e.g. don't invent a 4th mode or a live-fusion path) even if the mock data structure would technically allow it.
- Handle `error !== null` and `confidence_flag: "uncertain"` as first-class UI states you actually test — not an afterthought once the happy path looks good.

## Definition of done for this track
- [ ] All 3 modes render correctly against both the mock and the real backend
- [ ] Bounding boxes align precisely on images at multiple screen sizes
- [ ] Design system applied consistently — no template/default look anywhere
- [ ] Loading, error, and uncertainty states all built and tested, not just the happy path
- [ ] Responsive on laptop + tablet widths
- [ ] Honesty panel present and accurate to what's actually built

---

# Shared rules across all 3 people
1. Any change to Part 0's contracts requires updating this document and notifying both other people before writing code against the change.
2. Nobody sends a raw stack-trace/500 across a contract boundary for an expected failure — always shape it into the agreed error format.
3. Daily short sync: each person states (a) what changed in their contract-facing behavior, if anything, (b) what's currently blocking them. This catches drift early instead of at a big-bang merge.
4. Full end-to-end rehearsal (live tunnel + real backend + real frontend, including deliberately killing the tunnel once to confirm the fusion-demo fallback works) happens **before** the actual demo day, not during it.

---

# Implementation status

This repository now includes a runnable FastAPI implementation of Contract B, Contract C mock responses in `mocks/`, and API tests. It starts in deterministic demo mode so that the frontend can develop and rehearse without Earth Engine or GeoChat credentials. Set `GEOCHAT_ENDPOINT_URL` in `.env` to call a Contract A service; expected request validation failures are still returned as Contract B-shaped `200` responses with an `error` object.

## Run locally

```bash
uv sync --extra test
uv run uvicorn app.main:app --reload
uv run pytest
```

Copy `.env.example` to `.env`, then optionally set `GEMINI_API_KEY` for the Gemini query router and `GEOCHAT_ENDPOINT_URL` for the Contract A inference service. The backend loads this local file at startup; it never returns either secret in API responses. Live Earth Engine acquisition and deployment credentials remain environment-specific and must not be committed.

### Frontend origin / CORS

The Vercel production origin `https://sat-query-d55zzn18t-auctor28-s-projects1.vercel.app` is allowed by default. In the Render backend environment, set `FRONTEND_URL` to a comma-separated list of any additional exact browser origins, such as a custom domain: `https://satquery.example.com`. The backend allows `GET`, `POST`, and preflight `OPTIONS` requests only from the Vercel origin and these configured additions. For local development, explicitly add `http://localhost:3000` to `FRONTEND_URL`.

## Run with Docker

```bash
docker build -t satquery .
docker run --rm -p 8000:8000 --env-file .env satquery
```

The image starts the API on `0.0.0.0` and honors the platform-provided `PORT` environment variable (default: `8000`).
