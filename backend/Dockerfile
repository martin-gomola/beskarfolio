# Multi-stage build for optimized image size
FROM python:3.11-slim AS builder

ENV PATH="/opt/venv/bin:$PATH" \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Create virtual environment and install dependencies.
# The current dependency set resolves from wheels, so we can avoid apt installs entirely.
RUN python -m venv /opt/venv
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# Production stage
FROM python:3.11-slim AS production

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Create non-root user and writable app directories before copying code.
RUN groupadd -r appgroup && \
    useradd -r -g appgroup appuser && \
    mkdir -p /app/logs /app/config /app/data

# Copy virtual environment and application code
COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:appgroup . .

# Keep only runtime-writable directories group-writable.
RUN chmod -R 775 /app/logs /app/config /app/data

USER appuser

EXPOSE 8060

# Use stdlib urllib so the runtime image does not need curl.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8060/health', timeout=5)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8060"]
