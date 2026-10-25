#!/usr/bin/env bash
# Render Linux only: never sync the repaired Windows environment.
set -eu
if [ "$(uname -s)" != "Linux" ]; then
  echo "Refusing: this dependency installation is only for the Render Linux build."
  exit 2
fi
python -m pip install --disable-pip-version-check uv==0.13.5
uv sync --locked --no-dev
# No migration or application database writes occur during the build.
uv run --no-sync python -c 'import sqlalchemy; assert sqlalchemy.__version__ == "2.1.6"'
