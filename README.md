# PROVIA

PROVIA is an Android-first fitness and wellness application for weight loss,
muscle gain, weight maintenance, and overall health improvement.

Day 1, Task 2 provides the backend application foundation: centralized settings,
versioned routing, health/readiness endpoints, CORS, safe errors, and request logging.
Mobile, test-web, and shared API client directories are placeholders.

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
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   ├── cors.py
│   │   │   ├── exceptions.py
│   │   │   └── logging.py
│   │   └── api/
│   │       ├── __init__.py
│   │       └── v1/
│   │           ├── __init__.py
│   │           ├── router.py
│   │           └── endpoints/
│   │               ├── __init__.py
│   │               └── health.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_config.py
│   │   ├── test_foundation.py
│   │   └── test_health.py
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

No Neon credentials or other service credentials are needed. Optionally copy
`services/api/.env.example` to `services/api/.env` and edit local settings.
The application loads this file regardless of the working directory; process
environment variables take precedence. Settings are cached; restart after changes.
Never commit real credentials or local `.env` files.

## Configuration

Environment variable names are case-insensitive. CORS origins use a JSON array.

| Variable | Default / purpose |
| --- | --- |
| `APP_NAME` | `provia-api`; application title and health service name |
| `APP_VERSION` | `0.1.0`; OpenAPI and health version |
| `APP_ENV` | `development`; accepts development, testing, staging, production |
| `DEBUG` | `false`; enables debug logging locally, never traceback responses |
| `API_V1_PREFIX` | `/api/v1`; absolute path without trailing slash |
| `CORS_ORIGINS` | `["http://localhost:5173"]`; explicit HTTP(S) origins only |
| `CORS_ALLOW_CREDENTIALS` | `false`; opt in only for trusted browser origins |
| `LOG_LEVEL` | Optional DEBUG, INFO, WARNING, ERROR, CRITICAL; default INFO, or DEBUG with local DEBUG enabled |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Optional secret values, reserved for Task 3 |
| `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` | Optional; authentication not implemented |
| `USDA_API_KEY` | Optional secret; food integration not implemented |
| `R2_ENDPOINT_URL`, `R2_BUCKET_NAME` | Optional; storage integration not implemented |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Optional secrets; storage integration not implemented |

`.env.example` explicitly selects INFO logging. Remove that entry to use the
environment-aware default. Database URLs and credential fields use `SecretStr`
to mask their representation. The application never logs settings.

## Routing, CORS, and errors

`create_app()` creates an independent FastAPI instance; tests can supply a
`Settings` instance. `app = create_app()` remains the Uvicorn entry point.
`app/api/v1/router.py` registers endpoint routers beneath `API_V1_PREFIX`.
No import, startup, or readiness operation connects to an external service.

- `GET /api/v1/health`: process health and configured version.
- `GET /api/v1/health/ready`: initialized application only; returns
  `{"status":"ready","service":"provia-api"}`. It does not report database readiness.
- `GET /docs` and `GET /openapi.json`: Swagger UI and OpenAPI schema.

For a deployed testing frontend, set `CORS_ORIGINS` to its exact origin, for example
`["https://test.example.com"]`. Origins cannot contain wildcards, credentials,
paths, query strings, or fragments. Wildcards are rejected in every environment.
CORS permits common HTTP methods and Accept, Authorization, and Content-Type
headers. No response headers are exposed to browser JavaScript. Disallowed CORS
preflights return the middleware's standard 400 response. CORS is a browser policy,
not authentication or a server-side access restriction.

Application, HTTP, validation, and unexpected exceptions use this envelope:

```json
{"error":{"code":"RESOURCE_NOT_FOUND","message":"Requested resource was not found","details":null}}
```

Future modules can raise `AppError(code, message, status_code)` with static,
client-safe text. HTTP exception details are replaced with safe status messages;
HTTP response headers such as `WWW-Authenticate` are preserved. Validation errors
return 422 with a list of source (body/query/path), error code, and generic message.
Inputs, validator messages, contexts, and dynamic location segments are omitted
because they may contain secrets. Unexpected exceptions return a generic 500.
Debug mode never enables browser traceback pages.

## Logging

Standard Python logging emits timestamp, level, environment, request ID, method,
route template, status, and duration in milliseconds. Unknown paths are logged as
`<unmatched>`; route parameters are never logged. Each request gets a newly
generated UUID v4 in `X-Request-ID`; supplied IDs are ignored. Context variables
isolate IDs between concurrent requests and are reset when a request finishes.

Bodies, query strings, authorization headers, exception values, and tracebacks
are excluded. Unexpected failures emit a generic server error log correlated by
request ID. This deliberately trades traceback detail for protection against
secret-bearing exceptions. Uvicorn access logging is disabled to avoid a second
log containing raw paths and queries; the run command also disables it explicitly.
Repeated factory calls replace the owned console handler rather than duplicating
it. Logging configuration is process-wide; run one environment per worker process.

Middleware order is request logging, CORS, then sanitized error handling around
routing. This keeps CORS and request IDs on generated 500 responses, following
[Starlette's middleware ordering guidance](https://www.starlette.io/middleware/).
Errors after a response has started are logged, but cannot replace its status/body.

## Run the backend

From `services/api`:

```powershell
python -m uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
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
python -m uv run pytest -v
python -m uv run ruff check .
python -m uv run ruff format --check .
```

Optional coverage report:

```powershell
python -m uv run pytest --cov=app --cov-report=term-missing
```

Tests use FastAPI TestClient and require no external services.
