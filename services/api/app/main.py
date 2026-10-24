"""PROVIA ASGI entry point; preserve the public factory import."""

from app.application import create_app as create_app

app = create_app()
