import { UnauthorizedError } from '../common/errors.js';

/** Header carrying the authenticated caller's user id. Set only by the gateway. */
export const USER_ID_HEADER = 'x-user-id';

/** Header carrying the authenticated caller's username. Set only by the gateway. */
export const USERNAME_HEADER = 'x-username';

/**
 * Reads the caller's identity from the headers the gateway sets.
 * Downstream controllers read identity only through this function, so
 * they never depend on JWTs or `Authorization` headers directly.
 * @param {import('express').Request} req
 * @returns {{ userId: string, username: string }}
 * @throws {UnauthorizedError} if either header is missing — meaning the request reached this code without going through the gateway
 */
export function getRequestUser(req) {
  const userId = req.get(USER_ID_HEADER);
  const username = req.get(USERNAME_HEADER);

  if (!userId || !username) {
    throw new UnauthorizedError('Missing authenticated user headers');
  }

  return { userId, username };
}
