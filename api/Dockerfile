# Production image for the FastAPI backend. Build once per commit; the same image is
# smoke-tested in CI and deployed. GIT_SHA is baked in so /health identifies the release.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.11.23 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

FROM python:3.12-slim
ARG GIT_SHA=unknown
ARG VERSION=0.1.0
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 GIT_SHA=$GIT_SHA VERSION=$VERSION
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --from=build /app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
