# Notes Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a note-taking service in Express.js, backed by MongoDB, that multiple teams share. It has register/login with JWTs, a gateway that sets the authenticated user's identity headers, and notes that can be public or restricted to specific users.

**Architecture:** One Express 5 app split into feature modules (`auth`, `gateway`, `users`, `notes`), each with its own model class, repository, service, controller and router. Only the repositories talk to MongoDB. The gateway middleware checks the JWT, **removes any client-supplied identity headers**, and sets `x-user-id` and `x-username`. The notes controller reads identity only from those headers, so it doesn't know JWTs exist, and the gateway could later move to a separate API gateway process without changing the notes code.

**Tech Stack:** Node.js ≥ 22 (ESM; needed for `node --test` glob patterns), Express 5.2, MongoDB Node driver 7.x (native driver with hand-written model classes, not Mongoose), bcryptjs 3, jsonwebtoken 9, Node's built-in test runner (`node:test`), supertest, mongodb-memory-server. Docker Compose runs MongoDB for local development.

**Spec:** [docs/PROMPTS.md, Step 1](../../PROMPTS.md). The user's requirements are recorded there verbatim. The design decisions below fill the gaps in the spec, and every task follows them.

## Design Decisions (spec gaps resolved)

| Question | Decision |
|---|---|
| How does "the gateway" work? | Express middleware `createGateway(tokenService)` mounted after the public routes (`/health`, `/register`, `/login`) and before every other route. It deletes any incoming `x-user-id`/`x-username` headers, checks `Authorization: Bearer <jwt>`, and sets `req.headers['x-user-id']` and `req.headers['x-username']`. A request with no valid token gets a 401 on every path after the gateway, unknown paths included. |
| JWT contents | HS256, `sub` = user id (24-char hex ObjectId string), `username` claim, default expiry `1h` (`JWT_EXPIRES_IN`). |
| Username rules | Trimmed and lowercased before storing, so `Alice` and `alice` are the same user. Must match `/^[a-z0-9_.-]{3,32}$/`. A unique index enforces uniqueness. A duplicate returns 409. |
| Password rules | A string of at least 8 characters and at most 72 UTF-8 bytes (bcrypt's input limit). Stored as a bcrypt hash and never returned. |
| Login failure | Always `401 {"error":"Invalid username or password"}`, whether the user doesn't exist or the password is wrong. |
| Where is `sharedWith` stored? | As lowercase 24-char hex user-id strings, deduplicated. |
| Who can see a note (`GET /notes`)? | The note is visible when `sharedWith` is empty (public), **or** `sharedWith` contains the caller's user id, **or** the caller created it (`createdBy === username`). "Private" means `sharedWith` is non-empty: `[ownId]` hides it from everyone else. |
| `PUT /note` has no id in the path | The note id goes in the body: `{ "id": "<noteId>", "note"?: string, "sharedWith"?: string[] }`. At least one of `note`/`sharedWith` is required. |
| Who can update? | Anyone who can see the note can change `note`. **Only the creator can change `sharedWith`** (403 otherwise), so someone a note is shared with can't widen its audience. A note the caller can't see returns 404, so its existence isn't revealed. |
| Immutable fields in a `PUT` body | Any body key other than `id`, `note` or `sharedWith` (for example `createdBy`, `createdAt`, `updatedAt`, `updatedBy`) is rejected with 400, and nothing is written. |
| Extra fields in a `POST /note` body | Ignored. Only `note` and `sharedWith` are read. `createdBy`/`updatedBy` always come from the gateway headers. |
| Response shapes | Note: `{id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith}` (dates as ISO strings). `GET /notes` returns `{"notes":[...]}` sorted by `updatedAt` descending. Errors: `{"error": "<message>"}`. |
| Note length | 1 to 10,000 characters, and must not be only whitespace. |

## Global Constraints

- The project is ESM: `"type": "module"` in `package.json`. Use `import`/`export` only, with `.js` extensions on relative imports.
- Express **5** (`express@^5`). Async route handlers and middleware can throw, and Express 5 passes the error to the error handler, so no `asyncHandler` wrapper is needed.
- MongoDB storage goes through the native `mongodb` driver (v7). Only `*.repository.js` files may import from `mongodb` or touch collections.
- Each model is its own class file: `src/users/user.model.js` (`User`) and `src/notes/note.model.js` (`Note`).
- Note document shape, verbatim from the spec: `{note: String, createdAt: Date, updatedAt: Date, createdBy: String (username), updatedBy: String (username), sharedWith: []}`.
- `createdBy` and `createdAt` never change after insert. `updatedAt` and `updatedBy` are set only by the backend.
- The identity header names `x-user-id` and `x-username` are defined once, in `src/gateway/userHeaders.js`.
- Secrets come from the environment (`JWT_SECRET` is required, and the server refuses to start without it). `.env` is git-ignored.
- Tests: `npm test` runs `node --test` against an in-memory MongoDB. No test may need a real MongoDB or network access beyond the one-time mongodb-memory-server binary download.

## Review Focus

1. **Spoofed identity headers.** A client sending `x-user-id`/`x-username` itself must never be trusted. With no token it gets a 401. With a valid token, the token's identity replaces the spoofed headers. (Task 4 tests)
2. **The creator isn't listed in `sharedWith`.** Alice shares a note with `[bobId]` only. Alice must still see and edit it, Bob sees it, and Carol doesn't. (Tasks 5, 6, 7 tests)
3. **Immutable fields in `PUT /note`.** A body containing `createdBy`/`createdAt` returns 400 and leaves the stored note unchanged. It must not silently apply. (Task 7 tests)
4. **Malformed ids.** A non-ObjectId `id` or `sharedWith` entry (`"abc"`, `123`, a 12-character string) returns 400, not a 500 driver `BSONError`. (Tasks 6, 7 tests)
5. **Username case collisions.** Registering `alice` after `Alice` returns 409, and logging in as `ALICE` works. (Task 3 tests)

---

## File Structure

```
package.json                 scripts, deps, "type": "module"
.gitignore                   node_modules, .env
.env.example                 documented env vars
docker-compose.yml           local MongoDB
README.md                    setup + API reference (replaces stub)
docs/PROMPTS.md              verbatim log of every user input step (maintained throughout)
src/
  server.js                  process entry: load config, connect Mongo, listen, graceful shutdown
  app.js                     createApp({ db, config }): wires every module together (composition root)
  config.js                  loadConfig(env): reads and validates env vars
  common/
    errors.js                HttpError + BadRequest/Unauthorized/Forbidden/NotFound/Conflict
    errorHandler.js          notFoundHandler, errorHandler (JSON errors, malformed-JSON → 400)
    objectId.js              isObjectIdString(value)
  users/
    user.model.js            class User
    user.repository.js       class UserRepository (users collection)
  auth/
    token.service.js         class TokenService (issue/verify JWT)
    auth.validation.js       validateRegistration, validateLogin
    auth.service.js          class AuthService (register, login; bcrypt)
    auth.controller.js       class AuthController (HTTP ↔ AuthService)
    auth.routes.js           createAuthRouter(controller)
  gateway/
    userHeaders.js           USER_ID_HEADER, USERNAME_HEADER, getRequestUser(req)
    gateway.js               createGateway(tokenService) middleware
  notes/
    note.model.js            class Note
    note.repository.js       class NoteRepository (notes collection, visibility query)
    note.validation.js       validateCreateNote, validateUpdateNote
    note.service.js          class NoteService (create, listVisible, update + access rules)
    note.controller.js       class NotesController (HTTP ↔ NoteService)
    note.routes.js           createNotesRouter(controller)
test/
  helpers/testApp.js         startTestApp(), registerAndLogin()
  app.test.js
  config.test.js
  users/user.repository.test.js
  auth/token.service.test.js
  auth/auth.test.js
  gateway/gateway.test.js
  notes/note.model.test.js
  notes/note.repository.test.js
  notes/notes.create-list.test.js
  notes/notes.update.test.js
```

How a request flows through the layers: **router → controller** (HTTP only: reads the body and headers, calls validation, sends the status and JSON) **→ service** (business and access rules) **→ repository** (MongoDB) **→ model class** (domain object, `fromDocument`/`toDocument`/`toJSON`).

---

### Task 1: Project scaffold, config, error handling, test harness

**Files:**
- Create: `package.json`, `.gitignore`, `src/config.js`, `src/common/errors.js`, `src/common/errorHandler.js`, `src/common/objectId.js`, `src/app.js`, `test/helpers/testApp.js`, `test/app.test.js`, `test/config.test.js`
- Include in commit: `docs/PROMPTS.md`, `docs/superpowers/plans/2026-09-23-notes-service.md` (already written)

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env) → { port: number, mongoUri: string, jwtSecret: string, jwtExpiresIn: string, bcryptRounds: number }`, which throws `Error` if `JWT_SECRET` is missing
  - `HttpError(status, message)` and subclasses `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, each constructed as `new X(message?)` with a `.status`
  - `notFoundHandler(req, res)` and `errorHandler(err, req, res, next)`
  - `isObjectIdString(value) → boolean` (true only for a 24-character hex string)
  - `async createApp({ db, config }) → express.Application`
  - `async startTestApp() → { app, db, config, reset(): Promise<void>, stop(): Promise<void> }`

- [ ] **Step 1: Create `package.json` and install dependencies**

```json
{
  "name": "notes-service",
  "version": "1.0.0",
  "description": "Shared note-taking microservice (Express + MongoDB)",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test --test-concurrency=1 \"test/**/*.test.js\""
  }
}
```

Run:
```bash
npm install express@^5 mongodb@^7 bcryptjs@^3 jsonwebtoken@^9
npm install --save-dev supertest@^7 mongodb-memory-server@^11
```
Expected: `package.json` gains `dependencies`/`devDependencies`, and `package-lock.json` is created.

Create `.gitignore`:
```
node_modules/
.env
coverage/
```

- [ ] **Step 2: Write the failing tests**

`test/config.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig throws when JWT_SECRET is missing', () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
});

test('loadConfig applies defaults', () => {
  const config = loadConfig({ JWT_SECRET: 's3cret' });
  assert.deepEqual(config, {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/notes',
    jwtSecret: 's3cret',
    jwtExpiresIn: '1h',
    bcryptRounds: 12,
  });
});

test('loadConfig reads overrides from env', () => {
  const config = loadConfig({
    JWT_SECRET: 'x', PORT: '8080', MONGO_URI: 'mongodb://db/n', JWT_EXPIRES_IN: '15m', BCRYPT_ROUNDS: '10',
  });
  assert.equal(config.port, 8080);
  assert.equal(config.mongoUri, 'mongodb://db/n');
  assert.equal(config.jwtExpiresIn, '15m');
  assert.equal(config.bcryptRounds, 10);
});
```

`test/helpers/testApp.js`:
```js
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createApp } from '../../src/app.js';

export async function startTestApp() {
  const mongod = await MongoMemoryServer.create();
  const client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db('notes-test');
  const config = { jwtSecret: 'test-secret', jwtExpiresIn: '1h', bcryptRounds: 4 };
  const app = await createApp({ db, config });

  return {
    app,
    db,
    config,
    async reset() {
      const collections = await db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async stop() {
      await client.close();
      await mongod.stop();
    },
  };
}
```

`test/app.test.js`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestApp } from './helpers/testApp.js';
import { isObjectIdString } from '../src/common/objectId.js';

let ctx;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.stop(); });

test('GET /health returns ok', async () => {
  const res = await request(ctx.app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('malformed JSON body returns 400 JSON error', async () => {
  const res = await request(ctx.app)
    .post('/health')
    .set('Content-Type', 'application/json')
    .send('{"bad"');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Malformed JSON body' });
});

test('x-powered-by header is not sent', async () => {
  const res = await request(ctx.app).get('/health');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('isObjectIdString accepts only 24-char hex strings', () => {
  assert.equal(isObjectIdString('507f1f77bcf86cd799439011'), true);
  assert.equal(isObjectIdString('507F1F77BCF86CD799439011'), true);
  assert.equal(isObjectIdString('abc'), false);
  assert.equal(isObjectIdString('aaaaaaaaaaaa'), false); // 12 chars: valid to ObjectId.isValid, rejected here
  assert.equal(isObjectIdString(123), false);
  assert.equal(isObjectIdString(null), false);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/config.js` / `src/app.js`.

- [ ] **Step 4: Write the implementation**

`src/config.js`:
```js
export function loadConfig(env = process.env) {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return {
    port: Number(env.PORT ?? 3000),
    mongoUri: env.MONGO_URI ?? 'mongodb://localhost:27017/notes',
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1h',
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
  };
}
```

`src/common/errors.js`:
```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request') { super(400, message); }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') { super(401, message); }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') { super(403, message); }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') { super(404, message); }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict') { super(409, message); }
}
```

`src/common/errorHandler.js`:
```js
import { HttpError } from './errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Express identifies error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

`src/common/objectId.js`:
```js
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function isObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}
```

`src/app.js` (later tasks add module wiring at the marked spot):
```js
import express from 'express';
import { errorHandler, notFoundHandler } from './common/errorHandler.js';

export async function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Module wiring (auth, gateway, notes) is added here by later tasks.

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS. The first run downloads the MongoDB binary for mongodb-memory-server, which can take a minute.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore src test docs
git commit -m "chore: scaffold notes service with config, error handling and test harness"
```

---

### Task 2: User model and repository

**Files:**
- Create: `src/users/user.model.js`, `src/users/user.repository.js`
- Test: `test/users/user.repository.test.js`

**Interfaces:**
- Consumes: `ConflictError` (Task 1)
- Produces:
  - `class User { id?: string; username: string; passwordHash: string; createdAt: Date }`
    - `static normalizeUsername(username: string) → string` (trim + lowercase)
    - `static fromDocument(doc) → User`
    - `toDocument() → { username, passwordHash, createdAt }`
    - `toJSON() → { id, username, createdAt }` (never includes `passwordHash`)
  - `class UserRepository(db)`
    - `ensureIndexes() → Promise<void>` (unique index on `username`)
    - `create(user: User) → Promise<User>` (with `id` set). Throws `ConflictError('Username already exists')` on a duplicate
    - `findByUsername(username: string) → Promise<User | null>` (expects an already-normalized username)

- [ ] **Step 1: Write the failing test**

`test/users/user.repository.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { User } from '../../src/users/user.model.js';
import { UserRepository } from '../../src/users/user.repository.js';
import { ConflictError } from '../../src/common/errors.js';

let mongod, client, db, repo;

before(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  db = client.db('users-test');
  repo = new UserRepository(db);
  await repo.ensureIndexes();
});
after(async () => { await client.close(); await mongod.stop(); });
beforeEach(async () => { await db.collection('users').deleteMany({}); });

const makeUser = (username = 'alice') =>
  new User({ username, passwordHash: '$2a$04$hash', createdAt: new Date('2026-01-01T00:00:00Z') });

test('normalizeUsername trims and lowercases', () => {
  assert.equal(User.normalizeUsername('  Alice '), 'alice');
});

test('create stores the user and returns it with an id', async () => {
  const created = await repo.create(makeUser());
  assert.match(created.id, /^[0-9a-f]{24}$/);
  assert.equal(created.username, 'alice');
  const doc = await db.collection('users').findOne({ username: 'alice' });
  assert.equal(doc._id.toHexString(), created.id);
  assert.equal(doc.passwordHash, '$2a$04$hash');
});

test('create rejects duplicate usernames with ConflictError', async () => {
  await repo.create(makeUser());
  await assert.rejects(() => repo.create(makeUser()), ConflictError);
});

test('findByUsername returns a User or null', async () => {
  const created = await repo.create(makeUser());
  const found = await repo.findByUsername('alice');
  assert.ok(found instanceof User);
  assert.equal(found.id, created.id);
  assert.equal(await repo.findByUsername('nobody'), null);
});

test('toJSON never exposes passwordHash', async () => {
  const created = await repo.create(makeUser());
  const json = JSON.parse(JSON.stringify(created));
  assert.deepEqual(Object.keys(json).sort(), ['createdAt', 'id', 'username']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/users/user.repository.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `user.model.js`.

- [ ] **Step 3: Write the implementation**

`src/users/user.model.js`:
```js
export class User {
  constructor({ id, username, passwordHash, createdAt }) {
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
  }

  static normalizeUsername(username) {
    return username.trim().toLowerCase();
  }

  static fromDocument(doc) {
    return new User({
      id: doc._id.toHexString(),
      username: doc.username,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
    });
  }

  toDocument() {
    return {
      username: this.username,
      passwordHash: this.passwordHash,
      createdAt: this.createdAt,
    };
  }

  toJSON() {
    return { id: this.id, username: this.username, createdAt: this.createdAt };
  }
}
```

`src/users/user.repository.js`:
```js
import { User } from './user.model.js';
import { ConflictError } from '../common/errors.js';

const DUPLICATE_KEY_ERROR = 11000;

export class UserRepository {
  #collection;

  constructor(db) {
    this.#collection = db.collection('users');
  }

  async ensureIndexes() {
    await this.#collection.createIndex({ username: 1 }, { unique: true });
  }

  async create(user) {
    try {
      const { insertedId } = await this.#collection.insertOne(user.toDocument());
      return new User({ ...user.toDocument(), id: insertedId.toHexString() });
    } catch (err) {
      if (err.code === DUPLICATE_KEY_ERROR) {
        throw new ConflictError('Username already exists');
      }
      throw err;
    }
  }

  async findByUsername(username) {
    const doc = await this.#collection.findOne({ username });
    return doc ? User.fromDocument(doc) : null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/users/user.repository.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/users test/users
git commit -m "feat(users): add User model class and UserRepository"
```

---

### Task 3: Authentication module (`POST /register`, `POST /login`)

**Files:**
- Create: `src/auth/token.service.js`, `src/auth/auth.validation.js`, `src/auth/auth.service.js`, `src/auth/auth.controller.js`, `src/auth/auth.routes.js`
- Modify: `src/app.js` (wire the auth module), `test/helpers/testApp.js` (add `registerAndLogin`)
- Test: `test/auth/token.service.test.js`, `test/auth/auth.test.js`

**Interfaces:**
- Consumes: `User`, `UserRepository` (Task 2); `BadRequestError`, `UnauthorizedError` (Task 1)
- Produces:
  - `class TokenService({ secret, expiresIn })`
    - `issue(user: { id, username }) → string` (JWT, HS256, `sub` = id, claim `username`)
    - `verify(token: string) → { userId: string, username: string }`. Throws `UnauthorizedError('Invalid or expired token')`
  - `validateRegistration(body) → { username, password }` (username normalized)
  - `validateLogin(body) → { username, password }` (username normalized)
  - `class AuthService({ userRepository, tokenService, bcryptRounds })`
    - `register({ username, password }) → Promise<User>`
    - `login({ username, password }) → Promise<{ token: string, user: User }>`
  - `class AuthController(authService)` with arrow-function handlers `register`, `login`
  - `createAuthRouter(controller) → express.Router`
  - HTTP: `POST /register {username,password}` → `201 {id, username, createdAt}`; `POST /login {username,password}` → `200 {token, user:{id,username,createdAt}}`
  - Test helper: `registerAndLogin(app, username, password = 'password123') → Promise<{ userId, username, token, auth: { Authorization: string } }>`

- [ ] **Step 1: Write the failing TokenService test**

`test/auth/token.service.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { TokenService } from '../../src/auth/token.service.js';
import { UnauthorizedError } from '../../src/common/errors.js';

const tokens = new TokenService({ secret: 'secret-a', expiresIn: '1h' });
const user = { id: '507f1f77bcf86cd799439011', username: 'alice' };

test('issue + verify round-trips the identity', () => {
  const token = tokens.issue(user);
  assert.deepEqual(tokens.verify(token), { userId: user.id, username: 'alice' });
  const decoded = jwt.decode(token);
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.username, 'alice');
  assert.ok(decoded.exp > decoded.iat);
});

test('verify rejects a token signed with another secret', () => {
  const other = new TokenService({ secret: 'secret-b', expiresIn: '1h' }).issue(user);
  assert.throws(() => tokens.verify(other), UnauthorizedError);
});

test('verify rejects an expired token', () => {
  const expired = jwt.sign(
    { username: 'alice', exp: Math.floor(Date.now() / 1000) - 60 },
    'secret-a',
    { subject: user.id },
  );
  assert.throws(() => tokens.verify(expired), UnauthorizedError);
});

test('verify rejects an unsigned (alg=none) token', () => {
  const unsigned = jwt.sign({ username: 'alice' }, null, { algorithm: 'none', subject: user.id });
  assert.throws(() => tokens.verify(unsigned), UnauthorizedError);
});

test('verify rejects a token missing the username claim', () => {
  const noUsername = jwt.sign({}, 'secret-a', { subject: user.id });
  assert.throws(() => tokens.verify(noUsername), UnauthorizedError);
});

test('verify rejects garbage', () => {
  assert.throws(() => tokens.verify('not-a-jwt'), UnauthorizedError);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/auth/token.service.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `token.service.js`.

- [ ] **Step 3: Implement TokenService**

`src/auth/token.service.js`:
```js
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../common/errors.js';

const ALGORITHM = 'HS256';

export class TokenService {
  #secret;
  #expiresIn;

  constructor({ secret, expiresIn }) {
    this.#secret = secret;
    this.#expiresIn = expiresIn;
  }

  issue(user) {
    return jwt.sign({ username: user.username }, this.#secret, {
      subject: user.id,
      expiresIn: this.#expiresIn,
      algorithm: ALGORITHM,
    });
  }

  verify(token) {
    let payload;
    try {
      payload = jwt.verify(token, this.#secret, { algorithms: [ALGORITHM] });
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      throw new UnauthorizedError('Invalid or expired token');
    }
    return { userId: payload.sub, username: payload.username };
  }
}
```

Run: `node --test test/auth/token.service.test.js`
Expected: PASS (6 tests)

- [ ] **Step 4: Add the `registerAndLogin` test helper**

Append to `test/helpers/testApp.js`:
```js
import request from 'supertest';

export async function registerAndLogin(app, username, password = 'password123') {
  const registered = await request(app).post('/register').send({ username, password }).expect(201);
  const loggedIn = await request(app).post('/login').send({ username, password }).expect(200);
  return {
    userId: registered.body.id,
    username: registered.body.username,
    token: loggedIn.body.token,
    auth: { Authorization: `Bearer ${loggedIn.body.token}` },
  };
}
```
(Move the `import request from 'supertest';` line up to join the other imports at the top of the file.)

- [ ] **Step 5: Write the failing HTTP tests**

`test/auth/auth.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestApp } from '../helpers/testApp.js';

let ctx;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

const register = (body) => request(ctx.app).post('/register').send(body);
const login = (body) => request(ctx.app).post('/login').send(body);

test('POST /register creates a user and returns it without the password', async () => {
  const res = await register({ username: 'alice', password: 'password123' });
  assert.equal(res.status, 201);
  assert.match(res.body.id, /^[0-9a-f]{24}$/);
  assert.equal(res.body.username, 'alice');
  assert.ok(res.body.createdAt);
  assert.equal(res.body.passwordHash, undefined);
  assert.equal(res.body.password, undefined);
});

test('POST /register stores a bcrypt hash, never the plaintext password', async () => {
  await register({ username: 'alice', password: 'password123' });
  const doc = await ctx.db.collection('users').findOne({ username: 'alice' });
  assert.notEqual(doc.passwordHash, 'password123');
  assert.match(doc.passwordHash, /^\$2[aby]\$/);
});

test('POST /register normalizes username case and rejects case-variant duplicates', async () => {
  const first = await register({ username: '  Alice ', password: 'password123' });
  assert.equal(first.status, 201);
  assert.equal(first.body.username, 'alice');
  const dup = await register({ username: 'ALICE', password: 'password456' });
  assert.equal(dup.status, 409);
  assert.deepEqual(dup.body, { error: 'Username already exists' });
});

test('POST /register validates input', async () => {
  const cases = [
    {},
    { username: 'alice' },
    { password: 'password123' },
    { username: 'alice', password: 12345678 },
    { username: 'al', password: 'password123' },
    { username: 'alice smith', password: 'password123' },
    { username: 'a'.repeat(33), password: 'password123' },
    { username: 'alice', password: 'short' },
    { username: 'alice', password: 'x'.repeat(73) },
  ];
  for (const body of cases) {
    const res = await register(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('POST /register with no body returns 400', async () => {
  const res = await request(ctx.app).post('/register');
  assert.equal(res.status, 400);
});

test('POST /login returns a JWT carrying user id and username', async () => {
  const { body: user } = await register({ username: 'alice', password: 'password123' });
  const res = await login({ username: 'alice', password: 'password123' });
  assert.equal(res.status, 200);
  const decoded = jwt.verify(res.body.token, ctx.config.jwtSecret);
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.username, 'alice');
  assert.deepEqual(res.body.user, user);
});

test('POST /login is case-insensitive on username', async () => {
  await register({ username: 'alice', password: 'password123' });
  const res = await login({ username: 'ALICE', password: 'password123' });
  assert.equal(res.status, 200);
});

test('POST /login rejects wrong password and unknown user identically', async () => {
  await register({ username: 'alice', password: 'password123' });
  const wrongPassword = await login({ username: 'alice', password: 'wrong-password' });
  const unknownUser = await login({ username: 'nobody', password: 'password123' });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.deepEqual(wrongPassword.body, { error: 'Invalid username or password' });
  assert.deepEqual(unknownUser.body, wrongPassword.body);
});

test('POST /login with missing fields returns 400', async () => {
  const res = await login({ username: 'alice' });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `node --test test/auth/auth.test.js`
Expected: FAIL. `/register` returns 404 because the route isn't wired yet.

- [ ] **Step 7: Implement validation, service, controller, routes**

`src/auth/auth.validation.js`:
```js
import { BadRequestError } from '../common/errors.js';
import { User } from '../users/user.model.js';

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores input beyond 72 bytes

function readCredentials(body) {
  const { username, password } = body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new BadRequestError('username and password are required strings');
  }
  return { username: User.normalizeUsername(username), password };
}

export function validateRegistration(body) {
  const { username, password } = readCredentials(body);
  if (!USERNAME_PATTERN.test(username)) {
    throw new BadRequestError('username must be 3-32 characters: letters, digits, "_", "." or "-"');
  }
  if (password.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new BadRequestError('password must be at least 8 characters and at most 72 bytes');
  }
  return { username, password };
}

export function validateLogin(body) {
  return readCredentials(body);
}
```

`src/auth/auth.service.js`:
```js
import bcrypt from 'bcryptjs';
import { User } from '../users/user.model.js';
import { UnauthorizedError } from '../common/errors.js';

export class AuthService {
  #users;
  #tokens;
  #bcryptRounds;

  constructor({ userRepository, tokenService, bcryptRounds }) {
    this.#users = userRepository;
    this.#tokens = tokenService;
    this.#bcryptRounds = bcryptRounds;
  }

  async register({ username, password }) {
    const passwordHash = await bcrypt.hash(password, this.#bcryptRounds);
    return this.#users.create(new User({ username, passwordHash, createdAt: new Date() }));
  }

  async login({ username, password }) {
    const user = await this.#users.findByUsername(username);
    const valid = user !== null && (await bcrypt.compare(password, user.passwordHash));
    if (!valid) {
      throw new UnauthorizedError('Invalid username or password');
    }
    return { token: this.#tokens.issue(user), user };
  }
}
```

`src/auth/auth.controller.js`:
```js
import { validateLogin, validateRegistration } from './auth.validation.js';

export class AuthController {
  #auth;

  constructor(authService) {
    this.#auth = authService;
  }

  register = async (req, res) => {
    const user = await this.#auth.register(validateRegistration(req.body));
    res.status(201).json(user);
  };

  login = async (req, res) => {
    const { token, user } = await this.#auth.login(validateLogin(req.body));
    res.json({ token, user });
  };
}
```

`src/auth/auth.routes.js`:
```js
import { Router } from 'express';

export function createAuthRouter(controller) {
  const router = Router();
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  return router;
}
```

Modify `src/app.js` to build the dependencies and mount the router:
```js
import express from 'express';
import { errorHandler, notFoundHandler } from './common/errorHandler.js';
import { UserRepository } from './users/user.repository.js';
import { TokenService } from './auth/token.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { createAuthRouter } from './auth/auth.routes.js';

export async function createApp({ db, config }) {
  const userRepository = new UserRepository(db);
  await userRepository.ensureIndexes();

  const tokenService = new TokenService({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
  const authService = new AuthService({ userRepository, tokenService, bcryptRounds: config.bcryptRounds });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Public routes
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(createAuthRouter(new AuthController(authService)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Run all tests**

Run: `npm test`
Expected: PASS (all tests, including Task 1 and Task 2)

- [ ] **Step 9: Commit**

```bash
git add src/auth src/app.js test/auth test/helpers/testApp.js
git commit -m "feat(auth): add register and login endpoints with bcrypt and JWT"
```

---

### Task 4: Gateway (identity headers)

**Files:**
- Create: `src/gateway/userHeaders.js`, `src/gateway/gateway.js`
- Modify: `src/app.js` (mount the gateway after the public routes)
- Test: `test/gateway/gateway.test.js`

**Interfaces:**
- Consumes: `TokenService.verify(token) → { userId, username }` (Task 3); `UnauthorizedError`, `errorHandler` (Task 1)
- Produces:
  - `USER_ID_HEADER = 'x-user-id'`, `USERNAME_HEADER = 'x-username'`
  - `getRequestUser(req) → { userId: string, username: string }`. Throws `UnauthorizedError` if either header is missing
  - `createGateway(tokenService) → (req, res, next) => void`

- [ ] **Step 1: Write the failing tests**

`test/gateway/gateway.test.js`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createGateway } from '../../src/gateway/gateway.js';
import { getRequestUser } from '../../src/gateway/userHeaders.js';
import { TokenService } from '../../src/auth/token.service.js';
import { errorHandler } from '../../src/common/errorHandler.js';
import { startTestApp, registerAndLogin } from '../helpers/testApp.js';

const tokens = new TokenService({ secret: 'gw-secret', expiresIn: '1h' });
const alice = { id: '507f1f77bcf86cd799439011', username: 'alice' };

// A minimal app that echoes the identity the gateway sets.
function probeApp() {
  const app = express();
  app.use(createGateway(tokens));
  app.get('/whoami', (req, res) => res.json({
    headers: { 'x-user-id': req.get('x-user-id'), 'x-username': req.get('x-username') },
    user: getRequestUser(req),
  }));
  app.use(errorHandler);
  return app;
}

test('request without Authorization header is rejected', async () => {
  const res = await request(probeApp()).get('/whoami');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Missing or malformed Authorization header' });
});

test('non-Bearer Authorization header is rejected', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', `Token ${tokens.issue(alice)}`);
  assert.equal(res.status, 401);
});

test('invalid token is rejected', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', 'Bearer nope');
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid or expired token' });
});

test('spoofed identity headers without a token are rejected', async () => {
  const res = await request(probeApp())
    .get('/whoami')
    .set('x-user-id', alice.id)
    .set('x-username', 'alice');
  assert.equal(res.status, 401);
});

test('valid token sets x-user-id and x-username headers', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', `Bearer ${tokens.issue(alice)}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.headers, { 'x-user-id': alice.id, 'x-username': 'alice' });
  assert.deepEqual(res.body.user, { userId: alice.id, username: 'alice' });
});

test('spoofed identity headers are overwritten by the token identity', async () => {
  const res = await request(probeApp())
    .get('/whoami')
    .set('Authorization', `Bearer ${tokens.issue(alice)}`)
    .set('x-user-id', 'ffffffffffffffffffffffff')
    .set('x-username', 'mallory');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { userId: alice.id, username: 'alice' });
});

test('getRequestUser throws Unauthorized when headers are absent', () => {
  const req = { get: () => undefined };
  assert.throws(() => getRequestUser(req), { status: 401 });
});

// Integration: the gateway protects everything after the public routes.
let ctx;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.stop(); });

test('app: public routes stay reachable without a token', async () => {
  await request(ctx.app).get('/health').expect(200);
});

test('app: unknown route without token is 401, with token is 404', async () => {
  await request(ctx.app).get('/does-not-exist').expect(401);
  const { auth } = await registerAndLogin(ctx.app, 'gwuser');
  await request(ctx.app).get('/does-not-exist').set(auth).expect(404);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/gateway/gateway.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `gateway.js`.

- [ ] **Step 3: Implement**

`src/gateway/userHeaders.js`:
```js
import { UnauthorizedError } from '../common/errors.js';

export const USER_ID_HEADER = 'x-user-id';
export const USERNAME_HEADER = 'x-username';

// Downstream controllers read the caller's identity only through this function.
export function getRequestUser(req) {
  const userId = req.get(USER_ID_HEADER);
  const username = req.get(USERNAME_HEADER);
  if (!userId || !username) {
    throw new UnauthorizedError('Missing authenticated user headers');
  }
  return { userId, username };
}
```

`src/gateway/gateway.js`:
```js
import { UnauthorizedError } from '../common/errors.js';
import { USER_ID_HEADER, USERNAME_HEADER } from './userHeaders.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function createGateway(tokenService) {
  return function gateway(req, res, next) {
    // Never trust identity headers supplied by the client.
    delete req.headers[USER_ID_HEADER];
    delete req.headers[USERNAME_HEADER];

    const match = BEARER_PATTERN.exec(req.get('authorization') ?? '');
    if (!match) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const { userId, username } = tokenService.verify(match[1]);
    req.headers[USER_ID_HEADER] = userId;
    req.headers[USERNAME_HEADER] = username;
    next();
  };
}
```

Modify `src/app.js`. Add the import and mount the gateway directly after the auth router:
```js
import { createGateway } from './gateway/gateway.js';
```
```js
  // Public routes
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(createAuthRouter(new AuthController(authService)));

  // Everything below requires an authenticated user; the gateway sets x-user-id / x-username.
  app.use(createGateway(tokenService));

  app.use(notFoundHandler);
  app.use(errorHandler);
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/gateway src/app.js test/gateway
git commit -m "feat(gateway): verify JWT and set authenticated user headers"
```

---

### Task 5: Note model and repository

**Files:**
- Create: `src/notes/note.model.js`, `src/notes/note.repository.js`
- Test: `test/notes/note.model.test.js`, `test/notes/note.repository.test.js`

**Interfaces:**
- Consumes: `isObjectIdString` (Task 1)
- Produces:
  - `class Note { id?, note: string, createdAt: Date, updatedAt: Date, createdBy: string, updatedBy: string, sharedWith: string[] }`
    - `static create({ note, sharedWith = [], username, now = new Date() }) → Note` (createdAt = updatedAt = now, createdBy = updatedBy = username)
    - `static fromDocument(doc) → Note`
    - `isVisibleTo({ userId, username }) → boolean`
    - `isOwnedBy(username) → boolean`
    - `toDocument() → { note, createdAt, updatedAt, createdBy, updatedBy, sharedWith }`
    - `toJSON() → { id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith }`
  - `class NoteRepository(db)`
    - `ensureIndexes() → Promise<void>`
    - `insert(note: Note) → Promise<Note>`
    - `findById(id: string) → Promise<Note | null>` (returns null for a non-ObjectId string)
    - `findVisibleTo({ userId, username }) → Promise<Note[]>` (sorted by updatedAt desc)
    - `update(id: string, changes: { note?, sharedWith?, updatedAt, updatedBy }) → Promise<Note | null>`. Only `note`, `sharedWith`, `updatedAt`, `updatedBy` can be written

- [ ] **Step 1: Write the failing model test**

`test/notes/note.model.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Note } from '../../src/notes/note.model.js';

const ALICE = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'alice' };
const BOB = { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'bob' };
const CAROL = { userId: 'cccccccccccccccccccccccc', username: 'carol' };

test('Note.create sets audit fields from the username and one timestamp', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const note = Note.create({ note: 'hello', username: 'alice', now });
  assert.equal(note.note, 'hello');
  assert.equal(note.createdBy, 'alice');
  assert.equal(note.updatedBy, 'alice');
  assert.equal(note.createdAt, now);
  assert.equal(note.updatedAt, now);
  assert.deepEqual(note.sharedWith, []);
});

test('a note with empty sharedWith is visible to everyone', () => {
  const note = Note.create({ note: 'public', username: 'alice' });
  for (const user of [ALICE, BOB, CAROL]) assert.equal(note.isVisibleTo(user), true);
});

test('a restricted note is visible to listed users and its creator only', () => {
  const note = Note.create({ note: 'for bob', sharedWith: [BOB.userId], username: 'alice' });
  assert.equal(note.isVisibleTo(ALICE), true); // creator, even though not listed
  assert.equal(note.isVisibleTo(BOB), true);
  assert.equal(note.isVisibleTo(CAROL), false);
});

test('isOwnedBy compares against createdBy', () => {
  const note = Note.create({ note: 'x', username: 'alice' });
  assert.equal(note.isOwnedBy('alice'), true);
  assert.equal(note.isOwnedBy('bob'), false);
});

test('toJSON has exactly the public note shape', () => {
  const note = new Note({ id: 'dddddddddddddddddddddddd', ...Note.create({ note: 'x', username: 'alice' }).toDocument() });
  assert.deepEqual(Object.keys(note.toJSON()).sort(),
    ['createdAt', 'createdBy', 'id', 'note', 'sharedWith', 'updatedAt', 'updatedBy']);
});
```

- [ ] **Step 2: Write the failing repository test**

`test/notes/note.repository.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { Note } from '../../src/notes/note.model.js';
import { NoteRepository } from '../../src/notes/note.repository.js';

const ALICE = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'alice' };
const BOB = { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'bob' };
const CAROL = { userId: 'cccccccccccccccccccccccc', username: 'carol' };

let mongod, client, db, repo;
before(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  db = client.db('notes-repo-test');
  repo = new NoteRepository(db);
  await repo.ensureIndexes();
});
after(async () => { await client.close(); await mongod.stop(); });
beforeEach(async () => { await db.collection('notes').deleteMany({}); });

test('insert stores the spec document shape and returns a Note with id', async () => {
  const saved = await repo.insert(Note.create({ note: 'hi', username: 'alice' }));
  assert.match(saved.id, /^[0-9a-f]{24}$/);
  const doc = await db.collection('notes').findOne({});
  assert.deepEqual(Object.keys(doc).sort(),
    ['_id', 'createdAt', 'createdBy', 'note', 'sharedWith', 'updatedAt', 'updatedBy']);
  assert.ok(doc.createdAt instanceof Date);
});

test('findById returns the note, or null for missing / malformed ids', async () => {
  const saved = await repo.insert(Note.create({ note: 'hi', username: 'alice' }));
  assert.equal((await repo.findById(saved.id)).note, 'hi');
  assert.equal(await repo.findById('ffffffffffffffffffffffff'), null);
  assert.equal(await repo.findById('not-an-id'), null);
  assert.equal(await repo.findById('aaaaaaaaaaaa'), null);
});

test('findVisibleTo applies the public / shared / creator rules', async () => {
  await repo.insert(Note.create({ note: 'public', username: 'alice' }));
  await repo.insert(Note.create({ note: 'alice-to-bob', sharedWith: [BOB.userId], username: 'alice' }));
  await repo.insert(Note.create({ note: 'alice-private', sharedWith: [ALICE.userId], username: 'alice' }));

  const texts = async (user) => (await repo.findVisibleTo(user)).map((n) => n.note).sort();
  assert.deepEqual(await texts(ALICE), ['alice-private', 'alice-to-bob', 'public']);
  assert.deepEqual(await texts(BOB), ['alice-to-bob', 'public']);
  assert.deepEqual(await texts(CAROL), ['public']);
});

test('findVisibleTo sorts by updatedAt descending', async () => {
  await repo.insert(Note.create({ note: 'old', username: 'alice', now: new Date('2026-01-01') }));
  await repo.insert(Note.create({ note: 'new', username: 'alice', now: new Date('2026-06-01') }));
  const notes = await repo.findVisibleTo(ALICE);
  assert.deepEqual(notes.map((n) => n.note), ['new', 'old']);
});

test('update changes only the allowed fields and returns the updated note', async () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const saved = await repo.insert(Note.create({ note: 'v1', username: 'alice', now: created }));
  const later = new Date('2026-02-01T00:00:00Z');
  const updated = await repo.update(saved.id, {
    note: 'v2',
    updatedAt: later,
    updatedBy: 'bob',
    createdBy: 'mallory',            // must be ignored
    createdAt: new Date('1999-01-01'), // must be ignored
  });
  assert.equal(updated.note, 'v2');
  assert.equal(updated.updatedBy, 'bob');
  assert.deepEqual(updated.updatedAt, later);
  assert.equal(updated.createdBy, 'alice');
  assert.deepEqual(updated.createdAt, created);
});

test('update returns null for a missing note', async () => {
  const result = await repo.update('ffffffffffffffffffffffff', { note: 'x', updatedAt: new Date(), updatedBy: 'a' });
  assert.equal(result, null);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test test/notes/note.model.test.js test/notes/note.repository.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `note.model.js`.

- [ ] **Step 4: Implement**

`src/notes/note.model.js`:
```js
export class Note {
  constructor({ id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith = [] }) {
    this.id = id;
    this.note = note;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.sharedWith = sharedWith;
  }

  static create({ note, sharedWith = [], username, now = new Date() }) {
    return new Note({
      note,
      sharedWith,
      createdAt: now,
      updatedAt: now,
      createdBy: username,
      updatedBy: username,
    });
  }

  static fromDocument(doc) {
    return new Note({
      id: doc._id.toHexString(),
      note: doc.note,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
      updatedBy: doc.updatedBy,
      sharedWith: doc.sharedWith ?? [],
    });
  }

  // Empty sharedWith means shared with everyone; the creator can always see their own note.
  isVisibleTo({ userId, username }) {
    return this.sharedWith.length === 0
      || this.sharedWith.includes(userId)
      || this.isOwnedBy(username);
  }

  isOwnedBy(username) {
    return this.createdBy === username;
  }

  toDocument() {
    return {
      note: this.note,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      sharedWith: this.sharedWith,
    };
  }

  toJSON() {
    return { id: this.id, ...this.toDocument() };
  }
}
```

`src/notes/note.repository.js`:
```js
import { ObjectId } from 'mongodb';
import { Note } from './note.model.js';
import { isObjectIdString } from '../common/objectId.js';

const UPDATABLE_FIELDS = ['note', 'sharedWith', 'updatedAt', 'updatedBy'];

// Mirrors Note#isVisibleTo as a MongoDB query.
function visibleTo({ userId, username }) {
  return {
    $or: [
      { sharedWith: { $size: 0 } },
      { sharedWith: userId },
      { createdBy: username },
    ],
  };
}

export class NoteRepository {
  #collection;

  constructor(db) {
    this.#collection = db.collection('notes');
  }

  async ensureIndexes() {
    await this.#collection.createIndexes([
      { key: { sharedWith: 1 } },
      { key: { createdBy: 1 } },
      { key: { updatedAt: -1 } },
    ]);
  }

  async insert(note) {
    const doc = note.toDocument();
    const { insertedId } = await this.#collection.insertOne(doc);
    return new Note({ ...doc, id: insertedId.toHexString() });
  }

  async findById(id) {
    if (!isObjectIdString(id)) return null;
    const doc = await this.#collection.findOne({ _id: new ObjectId(id) });
    return doc ? Note.fromDocument(doc) : null;
  }

  async findVisibleTo(user) {
    const docs = await this.#collection
      .find(visibleTo(user))
      .sort({ updatedAt: -1, _id: -1 })
      .toArray();
    return docs.map((doc) => Note.fromDocument(doc));
  }

  async update(id, changes) {
    if (!isObjectIdString(id)) return null;
    const $set = Object.fromEntries(
      Object.entries(changes).filter(([key]) => UPDATABLE_FIELDS.includes(key)),
    );
    const doc = await this.#collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set },
      { returnDocument: 'after' },
    );
    return doc ? Note.fromDocument(doc) : null;
  }
}
```
(Driver note: in `mongodb` v6 and later, `findOneAndUpdate` returns the document itself, or `null`, not a `{ value }` wrapper.)

- [ ] **Step 5: Run to verify they pass**

Run: `node --test test/notes/note.model.test.js test/notes/note.repository.test.js`
Expected: PASS (11 tests)

- [ ] **Step 6: Commit**

```bash
git add src/notes/note.model.js src/notes/note.repository.js test/notes/note.model.test.js test/notes/note.repository.test.js
git commit -m "feat(notes): add Note model class and NoteRepository with visibility query"
```

---

### Task 6: Notes create and list (`POST /note`, `GET /notes`)

**Files:**
- Create: `src/notes/note.validation.js`, `src/notes/note.service.js`, `src/notes/note.controller.js`, `src/notes/note.routes.js`
- Modify: `src/app.js` (wire the notes module after the gateway)
- Test: `test/notes/notes.create-list.test.js`

**Interfaces:**
- Consumes: `Note`, `NoteRepository` (Task 5); `getRequestUser` (Task 4); `isObjectIdString`, `BadRequestError`, `NotFoundError`, `ForbiddenError` (Task 1); `startTestApp`, `registerAndLogin` (Tasks 1, 3)
- Produces:
  - `validateCreateNote(body) → { note: string, sharedWith: string[] }`
  - `validateUpdateNote(body) → { id: string, changes: { note?: string, sharedWith?: string[] } }` (used by Task 7, defined here with its helpers)
  - `class NoteService({ noteRepository })`
    - `create({ note, sharedWith }, user: { userId, username }, now = new Date()) → Promise<Note>`
    - `listVisible(user) → Promise<Note[]>`
  - `class NotesController(noteService)` with arrow-function handlers `create`, `list` (Task 7 adds `update`)
  - `createNotesRouter(controller) → express.Router` with `POST /note`, `GET /notes`
  - HTTP: `POST /note {note, sharedWith?}` → `201 <Note JSON>`; `GET /notes` → `200 {notes: [<Note JSON>...]}`

- [ ] **Step 1: Write the failing tests**

`test/notes/notes.create-list.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestApp, registerAndLogin } from '../helpers/testApp.js';

let ctx, alice, bob, carol;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  alice = await registerAndLogin(ctx.app, 'alice');
  bob = await registerAndLogin(ctx.app, 'bob');
  carol = await registerAndLogin(ctx.app, 'carol');
});

const createNote = (as, body) => request(ctx.app).post('/note').set(as.auth).send(body);
const listNotes = (as) => request(ctx.app).get('/notes').set(as.auth);

test('POST /note without a token is 401', async () => {
  const res = await request(ctx.app).post('/note').send({ note: 'hi' });
  assert.equal(res.status, 401);
});

test('POST /note creates a public note with audit fields from the gateway headers', async () => {
  const res = await createNote(alice, { note: 'hello teams' });
  assert.equal(res.status, 201);
  assert.match(res.body.id, /^[0-9a-f]{24}$/);
  assert.equal(res.body.note, 'hello teams');
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.deepEqual(res.body.sharedWith, []);
  assert.ok(!Number.isNaN(Date.parse(res.body.createdAt)));
  assert.equal(res.body.createdAt, res.body.updatedAt);
});

test('POST /note ignores client-supplied audit fields', async () => {
  const res = await createNote(alice, {
    note: 'hi',
    createdBy: 'mallory',
    updatedBy: 'mallory',
    createdAt: '1999-01-01T00:00:00.000Z',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.notEqual(res.body.createdAt, '1999-01-01T00:00:00.000Z');
});

test('POST /note normalizes and deduplicates sharedWith ids', async () => {
  const upper = bob.userId.toUpperCase();
  const res = await createNote(alice, { note: 'x', sharedWith: [upper, bob.userId] });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.sharedWith, [bob.userId]);
});

test('POST /note validates input', async () => {
  const cases = [
    {},
    { note: '' },
    { note: '   ' },
    { note: 42 },
    { note: 'x'.repeat(10_001) },
    { note: 'x', sharedWith: 'bob' },
    { note: 'x', sharedWith: ['not-an-id'] },
    { note: 'x', sharedWith: [123] },
    { note: 'x', sharedWith: ['aaaaaaaaaaaa'] },
  ];
  for (const body of cases) {
    const res = await createNote(alice, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 60)}`);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('GET /notes without a token is 401', async () => {
  await request(ctx.app).get('/notes').expect(401);
});

test('GET /notes returns public notes, notes shared with the caller, and own notes', async () => {
  await createNote(alice, { note: 'public' });
  await createNote(alice, { note: 'alice-to-bob', sharedWith: [bob.userId] });
  await createNote(alice, { note: 'alice-private', sharedWith: [alice.userId] });
  await createNote(carol, { note: 'carol-to-bob-and-carol', sharedWith: [bob.userId, carol.userId] });

  const texts = async (as) => {
    const res = await listNotes(as);
    assert.equal(res.status, 200);
    return res.body.notes.map((n) => n.note).sort();
  };

  assert.deepEqual(await texts(alice), ['alice-private', 'alice-to-bob', 'public']);
  assert.deepEqual(await texts(bob), ['alice-to-bob', 'carol-to-bob-and-carol', 'public']);
  assert.deepEqual(await texts(carol), ['carol-to-bob-and-carol', 'public']);
});

test('GET /notes returns newest first with the full note shape', async () => {
  await createNote(alice, { note: 'first' });
  await new Promise((r) => setTimeout(r, 5));
  await createNote(alice, { note: 'second' });
  const res = await listNotes(bob);
  assert.deepEqual(res.body.notes.map((n) => n.note), ['second', 'first']);
  assert.deepEqual(Object.keys(res.body.notes[0]).sort(),
    ['createdAt', 'createdBy', 'id', 'note', 'sharedWith', 'updatedAt', 'updatedBy']);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/notes/notes.create-list.test.js`
Expected: FAIL. `POST /note` returns 404 because the route isn't wired yet.

- [ ] **Step 3: Implement validation**

`src/notes/note.validation.js`:
```js
import { BadRequestError } from '../common/errors.js';
import { isObjectIdString } from '../common/objectId.js';

const MAX_NOTE_LENGTH = 10_000;
const UPDATABLE_FIELDS = ['note', 'sharedWith'];

function parseNoteText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestError('note must be a non-empty string');
  }
  if (value.length > MAX_NOTE_LENGTH) {
    throw new BadRequestError(`note must be at most ${MAX_NOTE_LENGTH} characters`);
  }
  return value;
}

function parseSharedWith(value) {
  if (!Array.isArray(value) || !value.every(isObjectIdString)) {
    throw new BadRequestError('sharedWith must be an array of user ids');
  }
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

export function validateCreateNote(body) {
  const { note, sharedWith = [] } = body ?? {};
  return { note: parseNoteText(note), sharedWith: parseSharedWith(sharedWith) };
}

export function validateUpdateNote(body) {
  const { id, ...fields } = body ?? {};
  if (!isObjectIdString(id)) {
    throw new BadRequestError('id must be a valid note id');
  }

  const disallowed = Object.keys(fields).filter((key) => !UPDATABLE_FIELDS.includes(key));
  if (disallowed.length > 0) {
    throw new BadRequestError(`Only note and sharedWith can be updated; not allowed: ${disallowed.join(', ')}`);
  }

  const changes = {};
  if ('note' in fields) changes.note = parseNoteText(fields.note);
  if ('sharedWith' in fields) changes.sharedWith = parseSharedWith(fields.sharedWith);
  if (Object.keys(changes).length === 0) {
    throw new BadRequestError('Provide note and/or sharedWith to update');
  }
  return { id: id.toLowerCase(), changes };
}
```

- [ ] **Step 4: Implement the service, controller and routes**

`src/notes/note.service.js`:
```js
import { Note } from './note.model.js';

export class NoteService {
  #notes;

  constructor({ noteRepository }) {
    this.#notes = noteRepository;
  }

  async create({ note, sharedWith }, user, now = new Date()) {
    return this.#notes.insert(Note.create({ note, sharedWith, username: user.username, now }));
  }

  async listVisible(user) {
    return this.#notes.findVisibleTo(user);
  }
}
```

`src/notes/note.controller.js`:
```js
import { getRequestUser } from '../gateway/userHeaders.js';
import { validateCreateNote } from './note.validation.js';

export class NotesController {
  #notes;

  constructor(noteService) {
    this.#notes = noteService;
  }

  create = async (req, res) => {
    const user = getRequestUser(req);
    const note = await this.#notes.create(validateCreateNote(req.body), user);
    res.status(201).json(note);
  };

  list = async (req, res) => {
    const notes = await this.#notes.listVisible(getRequestUser(req));
    res.json({ notes });
  };
}
```

`src/notes/note.routes.js`:
```js
import { Router } from 'express';

export function createNotesRouter(controller) {
  const router = Router();
  router.post('/note', controller.create);
  router.get('/notes', controller.list);
  return router;
}
```

Modify `src/app.js`. Add these imports:
```js
import { NoteRepository } from './notes/note.repository.js';
import { NoteService } from './notes/note.service.js';
import { NotesController } from './notes/note.controller.js';
import { createNotesRouter } from './notes/note.routes.js';
```
Replace the index setup at the top of `createApp` with:
```js
  const userRepository = new UserRepository(db);
  const noteRepository = new NoteRepository(db);
  await Promise.all([userRepository.ensureIndexes(), noteRepository.ensureIndexes()]);

  const tokenService = new TokenService({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
  const authService = new AuthService({ userRepository, tokenService, bcryptRounds: config.bcryptRounds });
  const noteService = new NoteService({ noteRepository });
```
and mount the notes router directly after the gateway:
```js
  app.use(createGateway(tokenService));
  app.use(createNotesRouter(new NotesController(noteService)));
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/notes src/app.js test/notes/notes.create-list.test.js
git commit -m "feat(notes): add POST /note and GET /notes with sharing visibility"
```

---

### Task 7: Notes update (`PUT /note`)

**Files:**
- Modify: `src/notes/note.service.js` (add `update`), `src/notes/note.controller.js` (add `update`), `src/notes/note.routes.js` (add `PUT /note`)
- Test: `test/notes/notes.update.test.js`

**Interfaces:**
- Consumes: `validateUpdateNote` (Task 6); `NoteRepository.findById`, `NoteRepository.update`, `Note#isVisibleTo`, `Note#isOwnedBy` (Task 5); `NotFoundError`, `ForbiddenError` (Task 1)
- Produces:
  - `NoteService#update(id: string, changes: { note?, sharedWith? }, user: { userId, username }, now = new Date()) → Promise<Note>`. Throws `NotFoundError('Note not found')` or `ForbiddenError('Only the note creator can change sharedWith')`
  - `NotesController#update`
  - HTTP: `PUT /note {id, note?, sharedWith?}` → `200 <Note JSON>`

- [ ] **Step 1: Write the failing tests**

`test/notes/notes.update.test.js`:
```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { startTestApp, registerAndLogin } from '../helpers/testApp.js';

let ctx, alice, bob, carol;
before(async () => { ctx = await startTestApp(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => {
  await ctx.reset();
  alice = await registerAndLogin(ctx.app, 'alice');
  bob = await registerAndLogin(ctx.app, 'bob');
  carol = await registerAndLogin(ctx.app, 'carol');
});

const createNote = async (as, body) =>
  (await request(ctx.app).post('/note').set(as.auth).send(body).expect(201)).body;
const updateNote = (as, body) => request(ctx.app).put('/note').set(as.auth).send(body);
const listTexts = async (as) =>
  (await request(ctx.app).get('/notes').set(as.auth).expect(200)).body.notes.map((n) => n.note);
const tick = () => new Promise((r) => setTimeout(r, 5));

test('PUT /note without a token is 401', async () => {
  await request(ctx.app).put('/note').send({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', note: 'x' }).expect(401);
});

test('creator updates note text: updatedAt/updatedBy change, createdAt/createdBy do not', async () => {
  const original = await createNote(alice, { note: 'v1' });
  await tick();
  const res = await updateNote(alice, { id: original.id, note: 'v2' });
  assert.equal(res.status, 200);
  assert.equal(res.body.note, 'v2');
  assert.equal(res.body.createdAt, original.createdAt);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.ok(Date.parse(res.body.updatedAt) > Date.parse(original.updatedAt));
});

test('another user with access can edit text; updatedBy becomes them, createdBy stays', async () => {
  const original = await createNote(alice, { note: 'public v1' });
  const res = await updateNote(bob, { id: original.id, note: 'bob was here' });
  assert.equal(res.status, 200);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'bob');
});

test('only the creator can change sharedWith', async () => {
  const original = await createNote(alice, { note: 'public' });
  const res = await updateNote(bob, { id: original.id, sharedWith: [bob.userId] });
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Only the note creator can change sharedWith' });
});

test('creator can make a note private and public again', async () => {
  const original = await createNote(alice, { note: 'secret' });

  const priv = await updateNote(alice, { id: original.id, sharedWith: [alice.userId] });
  assert.equal(priv.status, 200);
  assert.deepEqual(priv.body.sharedWith, [alice.userId]);
  assert.deepEqual(await listTexts(bob), []);
  assert.deepEqual(await listTexts(alice), ['secret']);

  const pub = await updateNote(alice, { id: original.id, sharedWith: [] });
  assert.equal(pub.status, 200);
  assert.deepEqual(await listTexts(bob), ['secret']);
});

test('creator not listed in sharedWith can still update their note', async () => {
  const original = await createNote(alice, { note: 'for bob', sharedWith: [bob.userId] });
  const res = await updateNote(alice, { id: original.id, note: 'for bob v2' });
  assert.equal(res.status, 200);
});

test('a user without access gets 404, not 403, and nothing changes', async () => {
  const original = await createNote(alice, { note: 'for bob', sharedWith: [bob.userId] });
  const res = await updateNote(carol, { id: original.id, note: 'carol edit' });
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Note not found' });
  const stored = await ctx.db.collection('notes').findOne({ _id: new ObjectId(original.id) });
  assert.equal(stored.note, 'for bob');
});

test('immutable / backend-owned fields in the body are rejected and nothing changes', async () => {
  const original = await createNote(alice, { note: 'v1' });
  for (const extra of [
    { createdBy: 'mallory' },
    { createdAt: '1999-01-01T00:00:00.000Z' },
    { updatedBy: 'mallory' },
    { updatedAt: '1999-01-01T00:00:00.000Z' },
  ]) {
    const res = await updateNote(alice, { id: original.id, note: 'v2', ...extra });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(extra)}`);
  }
  const stored = await ctx.db.collection('notes').findOne({ _id: new ObjectId(original.id) });
  assert.equal(stored.note, 'v1');
  assert.equal(stored.createdBy, 'alice');
  assert.equal(stored.createdAt.toISOString(), original.createdAt);
});

test('PUT /note validates id and payload', async () => {
  const original = await createNote(alice, { note: 'v1' });
  const cases = [
    { note: 'no id' },
    { id: 'not-an-id', note: 'x' },
    { id: 123, note: 'x' },
    { id: original.id },
    { id: original.id, note: '' },
    { id: original.id, sharedWith: ['bad'] },
    { id: original.id, sharedWith: null },
  ];
  for (const body of cases) {
    const res = await updateNote(alice, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('PUT /note for a well-formed but missing id is 404', async () => {
  const res = await updateNote(alice, { id: 'ffffffffffffffffffffffff', note: 'x' });
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/notes/notes.update.test.js`
Expected: FAIL. `PUT /note` returns 404 `{"error":"Not found"}` because the route doesn't exist yet.

- [ ] **Step 3: Implement**

`src/notes/note.service.js`. Add the imports and the method:
```js
import { Note } from './note.model.js';
import { ForbiddenError, NotFoundError } from '../common/errors.js';
```
```js
  async update(id, changes, user, now = new Date()) {
    const existing = await this.#notes.findById(id);
    if (!existing || !existing.isVisibleTo(user)) {
      throw new NotFoundError('Note not found');
    }
    if ('sharedWith' in changes && !existing.isOwnedBy(user.username)) {
      throw new ForbiddenError('Only the note creator can change sharedWith');
    }

    const updated = await this.#notes.update(id, {
      ...changes,
      updatedAt: now,
      updatedBy: user.username,
    });
    if (!updated) {
      throw new NotFoundError('Note not found');
    }
    return updated;
  }
```

`src/notes/note.controller.js`. Update the validation import and add the handler:
```js
import { validateCreateNote, validateUpdateNote } from './note.validation.js';
```
```js
  update = async (req, res) => {
    const { id, changes } = validateUpdateNote(req.body);
    const note = await this.#notes.update(id, changes, getRequestUser(req));
    res.json(note);
  };
```

`src/notes/note.routes.js`. Add:
```js
  router.put('/note', controller.update);
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/notes test/notes/notes.update.test.js
git commit -m "feat(notes): add PUT /note with immutable audit fields and owner-only sharing"
```

---

### Task 8: Server entry point, local MongoDB, README, end-to-end smoke test

**Files:**
- Create: `src/server.js`, `docker-compose.yml`, `.env.example`
- Modify: `README.md` (replace the stub), `package.json` (add `"start:env"` script)

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createApp` (Tasks 1–7)
- Produces: a runnable service (`npm run start:env`) on `PORT` (default 3000)

- [ ] **Step 1: Create `src/server.js`**

```js
import { MongoClient } from 'mongodb';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const client = new MongoClient(config.mongoUri);
await client.connect();

const app = await createApp({ db: client.db(), config });
const server = app.listen(config.port, () => {
  console.log(`notes-service listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await client.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

- [ ] **Step 2: Create `docker-compose.yml` and `.env.example`**

`docker-compose.yml`:
```yaml
services:
  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
volumes:
  mongo-data:
```

`.env.example`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/notes
# Required. Use a long random value, e.g. `openssl rand -hex 32`.
JWT_SECRET=change-me
JWT_EXPIRES_IN=1h
BCRYPT_ROUNDS=12
```

Add to the `package.json` scripts:
```json
"start:env": "node --env-file=.env src/server.js"
```

- [ ] **Step 3: Replace `README.md`**

````markdown
# Notes Service

A note-taking microservice shared across teams, built on Express 5 and MongoDB.

## Run locally

```bash
npm install
cp .env.example .env            # then set JWT_SECRET
docker compose up -d mongo
npm run start:env
```

## Test

```bash
npm test
```
Tests use an in-memory MongoDB, so Docker is not needed to run them.

## Architecture

```
src/
  auth/      register + login (AuthController → AuthService → UserRepository), JWT issuing (TokenService)
  gateway/   verifies the JWT and sets the x-user-id / x-username headers for all protected routes
  users/     User model class + repository
  notes/     Note model class + repository, NoteService (access rules), NotesController
  common/    HTTP errors, error handler, id helpers
  app.js     composition root: wires all modules together
```
Controllers only deal with HTTP, services hold the business rules, and repositories are the only code that talks to MongoDB.

## API

All request and response bodies are JSON. Errors look like `{"error": "<message>"}`.

### Authentication (public)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/register` | `{"username","password"}` | `201 {id, username, createdAt}` |
| POST | `/login` | `{"username","password"}` | `200 {token, user}` |

Usernames are 3–32 characters from `a-z 0-9 _ . -` and are case-insensitive. Passwords must be at least 8 characters and at most 72 bytes.

### Gateway

Every other route needs `Authorization: Bearer <token>`. The gateway throws away any client-sent `x-user-id` / `x-username` headers and sets them from the verified token.

### Notes (authenticated)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/note` | `{"note", "sharedWith"?: [userId]}` | `201 <note>` |
| GET | `/notes` | – | `200 {"notes": [<note>]}` (newest first) |
| PUT | `/note` | `{"id", "note"?, "sharedWith"?}` | `200 <note>` |

A note is `{id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith}`.

- An **empty `sharedWith`** means everyone can see the note.
- A **non-empty `sharedWith`** limits the note to those user ids plus its creator. Use `[yourOwnId]` to make it private.
- Anyone who can see a note can edit its text. Only the creator can change `sharedWith`.
- The backend sets `createdAt`, `createdBy`, `updatedAt` and `updatedBy`. A `PUT` body containing any of them is rejected with 400.
````

- [ ] **Step 4: End-to-end smoke test against a real MongoDB**

```bash
docker compose up -d mongo
cp .env.example .env && sed -i '' "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
npm run start:env &
sleep 2
curl -s -X POST localhost:3000/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"password123"}'
TOKEN=$(curl -s -X POST localhost:3000/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
NOTE_ID=$(curl -s -X POST localhost:3000/note -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"note":"hello"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -X PUT localhost:3000/note -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"id\":\"$NOTE_ID\",\"note\":\"hello again\"}"
curl -s localhost:3000/notes -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/notes
kill %1
```
Expected: register returns `201` JSON, `PUT` returns the note with `"note":"hello again"`, `GET /notes` lists it, and the final unauthenticated call prints `401`. (Delete the `alice` user afterwards with `docker compose down -v` if you want a clean DB.)

- [ ] **Step 5: Run the full suite one last time**

Run: `npm test`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add src/server.js docker-compose.yml .env.example README.md package.json
git commit -m "feat: add server entry point, local MongoDB compose file and README"
```

---

## Prompt log upkeep (applies to every session)

Every new input the user gives is appended to `docs/PROMPTS.md` as `## Step N: <short title> (<date>)`, with the input quoted verbatim and a one-line **Result:** note. Commit it along with the task it produced.
