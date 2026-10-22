"""PROVIA API entry point."""

from fastapi import FastAPI

app = FastAPI(title="PROVIA API", version="0.1.0", docs_url="/docs")


@app.get("/api/v1/health", tags=["health"])
def health() -> dict[str, str]:
    """Report application health without requiring external services."""
    return {"status": "ok", "service": "provia-api", "version": app.version}
