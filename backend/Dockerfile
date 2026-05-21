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

# Install gosu so the entrypoint can drop from root to the runtime user
# after fixing uid/gid. Static gosu is ~2MB and avoids the much heavier
# sudo + PAM dependency chain.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/*

# Create a runtime user/group with placeholder uid/gid 1000:1000. The
# entrypoint will rewrite these to match PUID/PGID at startup so writes
# to the bind-mounted /app/data volume keep the host's ownership.
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -m -s /bin/bash appuser && \
    mkdir -p /app/logs /app/config /app/data

# Copy virtual environment and application code
COPY --from=builder /opt/venv /opt/venv
COPY --chown=appuser:appgroup . .

# Make the entrypoint executable while we're still root.
RUN chmod +x /app/docker-entrypoint.sh

# Keep only runtime-writable directories group-writable.
RUN chmod -R 775 /app/logs /app/config /app/data

# NOTE: deliberately stay as root here. The entrypoint reconciles PUID/PGID
# and then `gosu`'s into appuser before exec'ing uvicorn.

EXPOSE 8060

# Use stdlib urllib so the runtime image does not need curl.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8060/health', timeout=5)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8060"]
