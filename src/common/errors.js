/**
 * Base class for every error that should be turned into a JSON HTTP
 * response by the shared error handler, instead of a generic 500.
 */
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code to respond with
   * @param {string} message - human-readable message sent back to the client
   */
  constructor(status, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

/** 400 — the request body or parameters failed validation. */
export class BadRequestError extends HttpError {
  constructor(message = 'Bad request') {
    super(400, message);
  }
}

/** 401 — no valid credentials were supplied. */
export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

/** 403 — the caller is known but not allowed to perform this action. */
export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

/** 404 — the resource doesn't exist, or isn't visible to this caller. */
export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

/** 409 — the request conflicts with existing state (e.g. a duplicate username). */
export class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}
