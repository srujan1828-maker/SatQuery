from __future__ import annotations

from datetime import date
from html import escape

from fastapi import FastAPI
from fastapi.responses import Response

from app.models import QueryRequest, QueryResponse
from app.services import handle_query

app = FastAPI(title="SatQuery API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    # Expected operational failures are represented by the Contract B error field.
    return await handle_query(request)


@app.get("/media/{image_id}.svg")
async def media(image_id: str) -> Response:
    """Self-contained demo imagery so Contract C can render without external media hosting."""
    safe_id = escape(image_id)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-label="Satellite demo image {safe_id}">
<defs><linearGradient id="land" x2="1" y2="1"><stop stop-color="#264c3f"/><stop offset="1" stop-color="#8a9d5d"/></linearGradient></defs>
<rect width="960" height="600" fill="url(#land)"/><path d="M0 390 C190 290 290 490 440 365 S730 265 960 410 L960 600 L0 600Z" fill="#1f6071" opacity=".88"/>
<path d="M65 100 L310 170 L240 300 L30 225Z M650 60 L890 110 L820 265 L590 210Z" fill="#c3bb75" opacity=".7"/>
<g stroke="#d8ddaa" stroke-width="7" opacity=".35"><path d="M120 0L510 600"/><path d="M510 0L800 600"/></g><text x="38" y="70" fill="white" font-family="system-ui" font-size="27" font-weight="600">{safe_id}</text></svg>'''
    return Response(svg, media_type="image/svg+xml")
