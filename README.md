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
