# PROVIA

PROVIA is an Android-first fitness and wellness application for weight loss,
muscle gain, weight maintenance, and overall health improvement.

Day 1, Task 1 provides the repository layout and a minimal backend with a health
endpoint. Mobile, test-web, and shared API client directories are placeholders.

## Technology stack

- Mobile (planned): React Native, Expo, TypeScript, Expo Router, NativeWind,
  TanStack Query, Zustand, Expo SQLite.
- Backend: Python 3.12, uv, FastAPI, Pydantic v2, pydantic-settings,
  SQLAlchemy 2, Alembic, Psycopg 3.
- Supporting libraries: HTTPX, boto3, PyJWT, cryptography.
- Development: Pytest, pytest-cov, Ruff; GitHub Actions planned.
- Infrastructure (planned): Neon PostgreSQL, Cloudflare R2, managed authentication
  (provider TBD), USDA FoodData Central, Open Food Facts, Android Health Connect.

The backend will be a modular monolith with feature-based organization and REST
routes under `/api/v1`. Database access, authentication, and feature logic are
reserved for later tasks.

## Folder structure

```text
Provia/
├── apps/
│   ├── mobile/.gitkeep
│   └── test-web/.gitkeep
├── services/api/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/__init__.py
│   │   └── api/
│   │       ├── __init__.py
│   │       └── v1/__init__.py
│   ├── tests/test_health.py
│   ├── .env.example
│   ├── .python-version
│   ├── pyproject.toml
│   └── uv.lock
├── packages/api-client/.gitkeep
├── docs/.gitkeep
├── .gitignore
└── README.md
```

## Prerequisites and installation

Install Git and uv. If Python is already available, install uv with:

```powershell
python -m pip install --user uv
```

From the repository root:

```powershell
cd services/api
python -m uv python install 3.12
python -m uv sync --locked
```

These commands create `.venv` with Python 3.12 and install runtime and development
dependencies from `uv.lock`. If uv is installed as a standalone executable, use
`uv` in place of `python -m uv` in all commands.

No Neon credentials or other service credentials are needed. `.env.example`
documents future configuration; it is not loaded by the Task 1 application.
Never commit real credentials or local `.env` files.

## Run the backend

From `services/api`:

```powershell
python -m uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Health: <http://127.0.0.1:8000/api/v1/health>
- Swagger UI: <http://127.0.0.1:8000/docs>

Health response:

```json
{"status":"ok","service":"provia-api","version":"0.1.0"}
```

## Test and lint

From `services/api`:

```powershell
python -m uv run pytest
python -m uv run ruff check .
python -m uv run ruff format --check .
```

Optional coverage report:

```powershell
python -m uv run pytest --cov=app --cov-report=term-missing
```

Tests use FastAPI TestClient and require no external services.
