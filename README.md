# Server San Clemente

Express-based JSON API with:
- JWT auth (register, login, refresh, me)
- Users management (admin + self-service)
- Filesystem-backed JSON database (atomic writes, simple indexes, Zod validation)
- Example data CRUD (notes) including list/search/tag filters
- Sensible security defaults (helmet, CORS), logging, graceful shutdown

## Requirements

- Node.js 18+ (recommended: latest LTS)
- npm

## Quick start

1) Install dependencies
```
npm install
```

2) Copy environment template and edit as needed
```
cp .env.example .env
```

3) Run in development (auto-restarts on changes)
```
npm run dev
```

4) Or run in production
```
npm start
```

Default server URL: http://localhost:3000

Health check: http://localhost:3000/api/health

## Scripts

- `npm run dev` – start with nodemon (development)
- `npm start` – start with node (production)
- `npm run lint` – run ESLint
- `npm run format` – run Prettier

## Environment variables

See `.env.example` for a complete, documented list. Common ones:
- `PORT` – server port (default: 3000)
- `CORS_ORIGINS` – comma-separated origins allowed by CORS
- `DATA_DIR` – directory for JSON files (default: ./data)
- `BCRYPT_ROUNDS` – bcrypt cost factor (default: 12)
- `JWT_SECRET` or `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` – JWT signing secrets
- `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` – token lifetimes (e.g., 15m, 7d)
- Optional admin seeding on first run (if users collection is empty):
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`

## Project structure

- `src/server.js` – main server entry (Express app, middleware, routes mount, error handling)
- `src/routes/auth.js` – auth endpoints (register, login, refresh, me)
- `src/routes/users.js` – users endpoints (list, get, update, delete)
- `src/routes/data.js` – example CRUD for notes
- `src/lib/db.js` – filesystem-backed JSON database (atomic writes, indexes, CRUD)
- `src/lib/auth.js` – password hashing, JWT helpers, auth middleware
- `src/lib/models.js` – models setup (users, notes), seeding, Zod schemas
- `data/` – JSON data files (created on first write), e.g., `users.json`, `notes.json`

## API overview

Base URL: `http://localhost:3000`

- Health
  - GET `/api/health` – returns `{ ok, name, version, uptime, timestamp, env }`

- Auth
  - POST `/api/auth/register` – body: `{ email, name, password }` → `{ user, tokens }`
  - POST `/api/auth/login` – body: `{ email, password }` → `{ user, tokens }`
  - POST `/api/auth/refresh` – body: `{ refreshToken }` or Authorization: Bearer <refreshToken> → `{ tokens }`
  - GET `/api/auth/me` – Authorization: Bearer <accessToken> → `{ user, token }`

- Users (Authorization: Bearer <accessToken>)
  - GET `/api/users` – admin only. Query: `q`, `limit`, `offset`, `sortBy`, `sortDir`
  - GET `/api/users/:id` – self or admin
  - PATCH `/api/users/:id` – self (email/name/password), admin (also roles/isActive)
  - DELETE `/api/users/:id` – admin only

- Notes (example data CRUD) (Authorization: Bearer <accessToken>)
  - GET `/api/data` – list your notes; admin can query others via `userId`
    - Query:
      - `q` – search in title/content
      - `tags` – comma-separated or array
      - `userId` – admin only
      - `limit`, `offset`, `sortBy`, `sortDir`
  - GET `/api/data/:id` – get note (owner or admin)
  - POST `/api/data` – create note `{ title, content?, tags?, userId? }` (userId admin only)
  - PATCH `/api/data/:id` – update note (owner or admin)
  - DELETE `/api/data/:id` – delete note (owner or admin)

### Authentication

- Access token: short-lived (default 15m). Send as `Authorization: Bearer <accessToken>`
- Refresh token: longer-lived (default 7d). Use `/api/auth/refresh` to obtain a new pair.
- JWT secrets must be configured via environment:
  - Either a single `JWT_SECRET`
  - Or separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`

### Error format

All errors return JSON:
```
{
  "error": {
    "message": "Human readable message",
    "code": "OPTIONAL_MACHINE_CODE",
    "id": "X-Request-Id"
  }
}
```

HTTP status codes:
- 400 – bad request/validation
- 401 – unauthorized
- 403 – forbidden
- 404 – not found
- 409 – conflict (e.g., duplicate email)
- 500 – server error

## Usage examples

Assuming `PORT=3000`:

1) Register a user
```
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","name":"Alice","password":"secret123"}'
```

2) Login
```
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

You’ll receive:
```
{
  "user": { "id": "...", "email": "alice@example.com", "name": "Alice", ... },
  "tokens": {
    "accessToken": "...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "accessTokenExpiresIn": 900,
    "refreshTokenExpiresIn": 604800
  }
}
```

3) Call an authenticated endpoint
```
ACCESS_TOKEN="paste access token here"

curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

4) Create a note
```
curl -X POST http://localhost:3000/api/data \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My first note","content":"Hello","tags":["personal","demo"]}'
```

5) List notes with filters
```
curl "http://localhost:3000/api/data?q=first&tags=demo&limit=10&offset=0&sortBy=createdAt&sortDir=desc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

6) Refresh tokens
```
REFRESH_TOKEN="paste refresh token here"

curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

## Data storage

- Files live under `DATA_DIR` (default `./data`):
  - `users.json` – array of user records `{ id, email, name, passwordHash, roles, isActive, ... }`
  - `notes.json` – array of note records `{ id, userId, title, content, tags, ... }`
- Atomic writes are used to prevent partial-corruption (temp file + rename).
- Equality indexes:
  - Users: `email` (unique), `isActive`
  - Notes: `userId`, `title`
- Zod schemas validate shape, with timestamps managed by the DB layer (`createdAt`, `updatedAt`).

## Security highlights

- `helmet` for HTTP security headers (CSP disabled by default for API)
- `cors` configured via `CORS_ORIGINS`
- `bcryptjs` for password hashing (`BCRYPT_ROUNDS` configurable)
- `jsonwebtoken` for JWT tokens (set strong secrets in production)
- Request IDs and logging via `morgan`

## Production notes

- Set strong, unique JWT secrets; never reuse dev secrets.
- Disable admin seeding or rotate the seeded admin password immediately.
- Run behind a reverse proxy and keep `app.set('trust proxy', 1)` if applicable.
- Consider a process manager (PM2/systemd) and enable HTTPS at the proxy layer.
- Tune server timeouts in `src/server.js` for your workload.

## License

Unlicensed / private project. Add your preferred license if you plan to distribute.