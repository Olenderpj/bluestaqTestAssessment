/**
 * OpenAPI component schemas for every model and request/response body the
 * API uses. This file has no executable code: swagger-jsdoc scans it for
 * `@openapi` comment blocks and merges them into `components.schemas`, so
 * route files can `$ref` a schema by name instead of repeating its shape.
 * Keeping every schema in one file means there is exactly one definition
 * per shape, and the swagger tests below catch drift from the real models.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       description: A registered user, as returned by /register and inside the /login response. Never includes the password hash.
 *       properties:
 *         id:
 *           type: string
 *           pattern: '^[0-9a-f]{24}$'
 *           example: 507f1f77bcf86cd799439011
 *         username:
 *           type: string
 *           example: alice
 *         createdAt:
 *           type: string
 *           format: date-time
 *       required: [id, username, createdAt]
 *
 *     Credentials:
 *       type: object
 *       description: Request body shared by /register and /login.
 *       properties:
 *         username:
 *           type: string
 *           minLength: 3
 *           maxLength: 32
 *           example: alice
 *         password:
 *           type: string
 *           minLength: 8
 *           example: password123
 *       required: [username, password]
 *
 *     LoginResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: "JWT bearer token. Send it back as `Authorization: Bearer <token>`."
 *         user:
 *           $ref: '#/components/schemas/User'
 *       required: [token, user]
 *
 *     Note:
 *       type: object
 *       description: A shared or private note. Matches the note document shape from the spec.
 *       properties:
 *         id:
 *           type: string
 *           pattern: '^[0-9a-f]{24}$'
 *         note:
 *           type: string
 *           minLength: 1
 *           maxLength: 10000
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         createdBy:
 *           type: string
 *           description: Username of the creator. Immutable after creation.
 *         updatedBy:
 *           type: string
 *           description: Username of the last editor. Always set by the server.
 *         sharedWith:
 *           type: array
 *           description: User ids allowed to see the note. Empty means everyone can see it.
 *           items:
 *             type: string
 *             pattern: '^[0-9a-f]{24}$'
 *       required: [id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith]
 *
 *     CreateNoteRequest:
 *       type: object
 *       properties:
 *         note:
 *           type: string
 *           minLength: 1
 *           maxLength: 10000
 *         sharedWith:
 *           type: array
 *           items:
 *             type: string
 *             pattern: '^[0-9a-f]{24}$'
 *       required: [note]
 *
 *     UpdateNoteRequest:
 *       type: object
 *       description: At least one of note/sharedWith is required. No other field is allowed; createdBy, createdAt, updatedAt and updatedBy are backend-owned.
 *       properties:
 *         id:
 *           type: string
 *           pattern: '^[0-9a-f]{24}$'
 *         note:
 *           type: string
 *           minLength: 1
 *           maxLength: 10000
 *         sharedWith:
 *           type: array
 *           items:
 *             type: string
 *             pattern: '^[0-9a-f]{24}$'
 *       required: [id]
 *
 *     NotesListResponse:
 *       type: object
 *       properties:
 *         notes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Note'
 *       required: [notes]
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: Note not found
 *       required: [error]
 */
