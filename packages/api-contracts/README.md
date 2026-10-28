# PROVIA API contracts

Current Phase4 export includes **67 paths and91 operations**, including first-party
authentication, derived onboarding, retry headers and the required measurement guard
on weight-to-goal confirmation. The [frontend handoff](../../docs/frontend-api-handoff.md)
and [generated inventory](../../docs/backend-endpoint-inventory.md) are authoritative
for consumption; live deployment is separately unverified.
Use `AccountOut` for identity. The auth and workout session response names are
qualified by FastAPI to avoid their `SessionOut` naming collision; prefer deriving
types from each operation. See [auth contract and cutover](../../docs/first-party-auth-completion-report.md).

These artifacts come from the FastAPI application, not hand-maintained DTOs. No
frontend application or runtime SDK is included. `openapi.json` uses code defaults
and does not load environment variables, dotenv files, credentials or live services.
The actual deployment may use a different API prefix; default is `/api/v1`.

From `services/api`, using the existing approved Python environment:

```powershell
uv run --no-sync python -m scripts.export_openapi
uv run --no-sync python -m scripts.export_openapi --check
uv run --no-sync python -m scripts.export_endpoint_inventory
uv run --no-sync python -m scripts.export_endpoint_inventory --check
```

Then from `packages/api-contracts` with Node22 and npm10.9.7:

```powershell
npm ci --ignore-scripts
npm run generate
npm run check
npm run typecheck
npm audit --ignore-scripts
```

Commit both generated artifacts and the endpoint inventory when contracts change. CI should export with
`--check`, run the TypeScript stale check and compile the contract assertions.
`npm ci` belongs only to this independent contracts package and never syncs Python.
The committed lockfile pins the generator and compiler; lifecycle scripts are disabled
in `.npmrc`. Do not approve dependency install scripts without inspecting them.

Import types only, for example:

```typescript
import type { paths, components } from "./schema";
type ActivityPut = components["schemas"]["ActivityPut"];
type ActivityResponse = paths["/api/v1/activity/daily"]["put"]["responses"][200]["content"]["application/json"];
```

Types do not perform runtime validation. Output Decimal values are strings; timestamps
and dates are strings with formats described in OpenAPI. Optional request properties
and nullable response properties have different meanings. Read
[frontend handoff](../../docs/frontend-api-handoff.md) before wiring clients.

Tool reference: [openapi-typescript CLI](https://openapi-ts.dev/cli).
