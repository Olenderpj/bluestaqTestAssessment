import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../common/errors.js';

const ALGORITHM = 'HS256';

/**
 * Issues and verifies the JWTs that carry a user's identity between
 * login and every subsequent authenticated request. Always uses HS256
 * explicitly, so a token signed with `alg: none` or a different
 * algorithm can never be accepted.
 */
export class TokenService {
  #secret;
  #expiresIn;

  /**
   * @param {object} options
   * @param {string} options.secret - HMAC signing secret
   * @param {string} options.expiresIn - jsonwebtoken expiry string, e.g. "1h"
   */
  constructor({ secret, expiresIn }) {
    this.#secret = secret;
    this.#expiresIn = expiresIn;
  }

  /**
   * Signs a token for a user.
   * @param {{ id: string, username: string }} user
   * @returns {string} a signed JWT with `sub` = user id and a `username` claim
   */
  issue(user) {
    return jwt.sign({ username: user.username }, this.#secret, {
      subject: user.id,
      expiresIn: this.#expiresIn,
      algorithm: ALGORITHM,
    });
  }

  /**
   * Verifies a token's signature and expiry, and extracts the identity.
   * @param {string} token
   * @returns {{ userId: string, username: string }}
   * @throws {UnauthorizedError} if the token is missing, malformed, expired, or wrongly signed
   */
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
