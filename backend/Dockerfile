# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Rasterio/GDAL wheels require Expat at runtime even on the slim image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the package before installing it so the PEP 517 build can discover `app`.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .
# Fail the image build, rather than deployment, if native libraries are missing.
RUN python -c "import rasterio; import pyproj; from app.main import app"

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# The platform supplies PORT when necessary; default to the documented local port.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
