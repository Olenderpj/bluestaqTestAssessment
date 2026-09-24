import { BadRequestError } from '../common/errors.js';
import { User } from '../users/user.model.js';

const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently ignores input past 72 bytes, so longer passwords must be rejected explicitly.
const MAX_PASSWORD_BYTES = 72;

/**
 * Extracts and normalizes username/password from a request body, shared
 * by both register and login since they take the same shape.
 * @param {unknown} body
 * @returns {{ username: string, password: string }}
 * @throws {BadRequestError} if either field is missing or not a string
 */
function readCredentials(body) {
  const { username, password } = body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new BadRequestError('username and password are required strings');
  }

  return { username: User.normalizeUsername(username), password };
}

/**
 * Validates a registration request body, applying the username/password
 * rules that only apply at signup (login accepts any existing username).
 * @param {unknown} body
 * @returns {{ username: string, password: string }}
 * @throws {BadRequestError} if the username or password shape is invalid
 */
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

/**
 * Validates a login request body.
 * @param {unknown} body
 * @returns {{ username: string, password: string }}
 * @throws {BadRequestError} if either field is missing
 */
export function validateLogin(body) {
  return readCredentials(body);
}
