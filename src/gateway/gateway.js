import { UnauthorizedError } from '../common/errors.js';
import { USER_ID_HEADER, USERNAME_HEADER } from './userHeaders.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Builds the gateway middleware: verifies the caller's JWT and replaces
 * any client-supplied identity headers with the verified identity.
 * Mounted after the public routes, so everything below it can trust
 * `x-user-id` / `x-username` without re-checking the token.
 * @param {import('../auth/token.service.js').TokenService} tokenService
 * @returns {import('express').RequestHandler}
 */
export function createGateway(tokenService) {
  return function gateway(req, res, next) {
    // A client could set these headers directly; never trust them
    // until they're overwritten below from a verified token.
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
