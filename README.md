# Notes Service

This service stores notes for teams. It uses Express 5 and MongoDB.

## Requirements

* [Node.js](https://nodejs.org/) 22 or later
* [Docker](https://www.docker.com/) (with Docker Compose), used to run MongoDB locally

## Run locally

```bash
npm install
docker compose up -d mongo
npm run start:env
```

The repo includes a `.env` file with working default values. Do not use this file in production. See `.env.example` for the list of required variables.

After the service starts, go to http://localhost:3000/api-docs to view the API docs. The raw spec is at `/api-docs.json`.

### Authenticating in Swagger

1. In the Swagger UI, open **POST /register** (or **POST /login** if you already have an account), click **Try it out**, and submit a `{"username","password"}` body.
2. `POST /login` returns `{"token", "user"}` — copy the `token` value.
3. Click the **Authorize** button (top right of the page, next to the padlock icons on the protected endpoints).
4. Paste the token into the `bearerAuth` value field — just the raw token, **not** prefixed with `Bearer ` (Swagger adds that for you) — then click **Authorize**, then **Close**.
5. Every protected endpoint (`/note`, `/notes`) will now send `Authorization: Bearer <token>` automatically. Tokens expire after `JWT_EXPIRES_IN` (12h by default); re-run **Authorize** with a fresh token from `/login` once it does.

## Test

```bash
npm test
```
The tests use an in-memory MongoDB. Docker is not required to run the tests.

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
Controllers handle HTTP only. Services hold the business rules. Repositories are the only code that connects to MongoDB.

### Design Choices

* **Server:** I used Express.js in this project since it is the #1 used package for building HTTPS servers and RESTful services in JS/TS. Additionally there are minimal throughput and processing requirements outside of database interactions. This means that its versions have long term support, as well as the community of developers have been able to work out any found issues. While there are other server or framework packages out there, Express is great for rapid prototyping and lightweight API's.
* **Database:** Since this is prototype code, I went with MongoDB since the ability to have a flexible schema makes development easy, as well as adding or changing fields doesn't require any downtime or complex migrations which would allow for less downtime should the schema ever change or additional features needed to be supported in the future.
* **Authentication:** Here I added a simple authentication layer to the service so that users' notes are protected and content can have access controls. Since this is a team repository (similar to Confluence) notes are shared by default and access controls can be limited based on the sharedWith array of user id's. I also used an authentication layer here to automatically inject headers containing user metadata so that validation can be performed within each controller and the proper access is provided to each user.

### Testing Philosophy

* **Unit test pure logic, integration test everything else:** `Note.isVisibleTo`/`isOwnedBy`/`toJSON` are tested with no DB and no HTTP since they're pure domain logic. Everything that touches routing, auth, or persistence is tested through the real HTTP stack (`supertest` against `createApp()`) backed by an actual `mongodb-memory-server` instance instead of a mocked repository — a mock would still pass even if the real Mongo filter/update logic were wrong.
* **Security behavior is tested as a first-class case, not incidental:** spoofed `x-user-id`/`x-username` headers being overwritten by the gateway, and the 401 vs. 403 vs. 404 distinctions (an inaccessible note returns 404 rather than 403, so its existence isn't leaked to users without access) each get an explicit test.
* **Boundary and negative cases get equal weight to the happy path:** malformed ids, attempts to set immutable fields, sharing with a nonexistent user id, and empty vs. non-empty `sharedWith` are each their own test rather than folded into one broad "it works" test.
* **Shared fixtures over duplicated setup:** `test/helpers/testApp.js` centralizes `startTestApp()` and `registerAndLogin()` so each test body reads as intent, not boilerplate.
* **What's intentionally not tested:** the Mongo driver itself, `swagger-jsdoc`'s internal parsing (just that the built spec contains the expected paths), and there's no e2e/UI layer since this is an API-only service.

### Future Work

* **Collaboration:** Support websockets so that users have the ability to collaborate and work together in real-time on shared notes.
* **Caching layer:** Objects like notes tend to be read-heavy so in the future I would add a caching layer (like Redis) to store notes that are retrieved often.
* **Response pagination:** Currently the GET /notes endpoint retrieves all notes available to the user. This won't scale.
* **Folders / organization strategy:** Allow users to store notes within a nested folder structure for better team/project organization.

## API

All request and response bodies use JSON format. Error responses have this format: `{"error": "<message>"}`.

### Authentication (public)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/register` | `{"username","password"}` | `201 {id, username, createdAt}` |
| POST | `/login` | `{"username","password"}` | `200 {token, user}` |

A username must have 3 to 32 characters, using only `a-z 0-9 _ . -`. Usernames are not case-sensitive. A password must have at least 8 characters and not more than 72 bytes.

### Gateway

All other routes require an `Authorization: Bearer <token>` header. The gateway removes any `x-user-id` or `x-username` headers sent by the client, then sets them from the verified token.

### Notes (authenticated)

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/note` | `{"note", "sharedWith"?: [userId]}` | `201 <note>` |
| GET | `/notes` | – | `200 {"notes": [<note>]}` (newest first) |
| PUT | `/note` | `{"id", "note"?, "sharedWith"?}` | `200 <note>` |

A note is `{id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith}`.

- An **empty `sharedWith`** means everyone can see the note.
- A **non-empty `sharedWith`** limits the note to the listed user IDs and the creator. To make a note private, set `sharedWith` to `[yourOwnId]`.
- Anyone who can see a note can edit its text. Only the creator can change `sharedWith`.
- The backend sets the `createdAt`, `createdBy`, `updatedAt`, and `updatedBy` fields. If a `PUT` body includes any of these fields, the service returns a 400 error.
