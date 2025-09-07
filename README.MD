# Backend Service (Internal)

Backend for this project using Node.js, Express, MongoDB, and bcrypt for credential security. Everything here is project‑specific (no generic boilerplate).

## 1. Purpose
- Encapsulate domain logic
- Provide authenticated + authorized API
- Abstract persistence (MongoDB models)
- Offer logging, health, and operational insight

## 2. Stack
| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript (adjust if JS only) |
| Framework | Express |
| Database | MongoDB (via Mongoose) |
| Auth | JWT (access + refresh) + bcrypt password hashing |
| Validation | Zod (DTO schemas) |
| Tests | Jest + Supertest |
| Lint/Format | ESLint + Prettier |
| Container | Docker / docker-compose |
| CI | GitHub Actions |

## 3. Directory Layout
```
src/
    config/        env & config loader/validation
    db/            mongoose connection & plugins
    models/        Mongoose schemas & models
    routes/        route registration
    controllers/   HTTP layer (thin)
    services/      domain logic
    repositories/  data abstractions (wrap models) - optional
    dtos/          request/response typing + validation
    middlewares/   auth, validation, error, rate-limit
    utils/         helpers
    jobs/          background/scheduled tasks (future)
    tests/         unit + integration
    scripts/       seed / maintenance scripts
```

## 4. Data & Domain (Snapshot)
Core entities:
- User (email, passwordHash, roles[], status)
- Session / RefreshToken (if persisted; or rotation blacklist)
- Example domain entity (e.g., Item)

Add an entity:
1. Create model in models/
2. Add validation schema (dtos/)
3. Add repository (optional) + service
4. Add controller + route
5. Add tests (unit + integration)
6. Update indexes (see docs/db-indexes.md)

## 5. API Conventions
- Base path: /api/v1
- JSON only (UTF-8)
- camelCase in responses; Mongo _id mapped to id
- Pagination: ?page=1&limit=20 -> meta { page, limit, total, pages }
- Filtering: ?filter[field]=value
- Sorting: ?sort=field,-otherField
- Error envelope:
```
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "Input invalid",
        "details": [{ "field": "email", "message": "Invalid email" }]
    }
}
```

## 6. Auth & Authorization
- Passwords hashed with bcrypt (configurable salt rounds)
- Login -> short‑lived access token + refresh token (httpOnly secure cookie)
- Access payload: { sub:userId, roles:[...], iat, exp }
- Refresh rotation; optionally persist invalidated tokens (collection: revoked_tokens)
- Role guard middleware requiresRole('admin')
- Service layer handles fine-grained ownership checks

## 7. Validation
- Zod schemas per DTO
- 400 on first failure with details[]
- Always verify IDs (ObjectId.isValid + existence)

## 8. Configuration
Environment (.env example):
```
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://localhost:27017/project_db
ACCESS_TOKEN_SECRET=CHANGE_ME
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=CHANGE_ME_TOO
REFRESH_TOKEN_EXPIRES_IN=30d
BCRYPT_SALT_ROUNDS=12
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```
Startup validates config; process exits if invalid.

## 9. Setup (Local)
```
npm install
cp .env.example .env
npm run dev
```
Health: http://localhost:10000/api/v1/health/live

## 10. Common Scripts
```
dev            nodemon / ts-node reload
build          tsc to dist/
start          node dist/index.js
lint           ESLint check
lint:fix       ESLint fix
format         Prettier write
test           Jest (unit + integration)
test:watch     Watch mode
test:cov       Coverage
seed           node dist/scripts/seed.js (after build) or ts-node
```

## 11. Logging
- pino logger
- requestId middleware (X-Request-Id or generated UUID)
- Production structured JSON
- No secrets / hashes / tokens in logs

## 12. Error Handling
Custom error base with:
- code
- httpStatus
- message
- details? (array/object)
Fallback -> 500 generic (hide stack in production)

## 13. Performance
- Use lean() on read-heavy queries where doc methods not needed
- Project only required fields
- Add indexes (compound where useful) and track in docs/db-indexes.md
- Avoid N+1 by batching queries
- Heavy tasks -> jobs/ (future queue integration)

## 14. Security
- Helmet
- Rate limiting (in middlewares/)
- Input validation + sanitization
- HTTPS enforced in production (trust proxy behind load balancer)
- Tokens: httpOnly, secure (prod), sameSite=strict
- Bcrypt salt rounds tuned for acceptable latency
- No plaintext secrets in repo

## 15. Health & Observability
Endpoints:
- /api/v1/health/live  (process up)
- /api/v1/health/ready (MongoDB ping)
Optional future: /metrics (Prometheus), tracing (OpenTelemetry)

## 16. Testing
- Unit: pure services, utils (mock model layer)
- Integration: API endpoints with test DB (separate database name)
- Use in-memory Mongo (mongodb-memory-server) or ephemeral container in CI
- Deterministic seed data

## 17. Data Change Workflow
Mongo has no built-in migrations; choose one:
- Option A: migration scripts in scripts/migrations (timestamped)
- Option B: migrate-mongo package
Process:
1. Add/update model
2. Write migration if structural/backfill change needed
3. Run migration script before deploy
Never rewrite executed migration scripts; append new ones.

## 18. Deployment Notes
- Multi-stage Docker build
- App waits for Mongo connection (retry logic)
- Orchestrator (Compose/K8s) supplies env vars
- Liveness: /api/v1/health/live
- Readiness: /api/v1/health/ready
Example:
```
docker build -t backend:local .
docker run --env-file .env -p 4000:4000 backend:local
```

## 19. Versioning
Internal semantic:
- MAJOR: breaking endpoint/contract
- MINOR: additive
- PATCH: fixes / internal improvements

## 20. Contributing (Internal)
1. Branch: feature/<ticket>-short-name
2. Implement + tests
3. npm run lint && npm test && npm run build
4. Update docs (README / indexes / env sample)
5. PR referencing ticket

## 21. Troubleshooting
Mongo connection fail -> check MONGODB_URI & server running
Hanging queries -> inspect missing index (add & document)
Invalid JWT -> verify secrets & system clock
High bcrypt latency -> lower BCRYPT_SALT_ROUNDS (balance security)
Rate limit triggers locally -> raise RATE_LIMIT_MAX for dev

## 22. Roadmap (Active)
- OpenAPI spec generation
- Per-endpoint rate limiting refinement
- Background job queue (Bull / RabbitMQ optional)
- Distributed tracing (OTel)
- Central token revocation list

## 23. Internal Notes
- Keep controllers thin
- Services own business rules
- Reuse validation schemas; avoid duplication
- New env var -> update .env.example + config validation
- Keep README aligned with actual code

Last updated: (update when changed)
