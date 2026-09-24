import bcrypt from 'bcryptjs';
import { User } from '../users/user.model.js';
import { UnauthorizedError } from '../common/errors.js';

/**
 * Business logic for registration and login: hashing/checking
 * passwords and issuing tokens. Knows nothing about HTTP.
 */
export class AuthService {
  #users;
  #tokens;
  #bcryptRounds;

  /**
   * @param {object} deps
   * @param {import('../users/user.repository.js').UserRepository} deps.userRepository
   * @param {import('./token.service.js').TokenService} deps.tokenService
   * @param {number} deps.bcryptRounds - bcrypt cost factor
   */
  constructor({ userRepository, tokenService, bcryptRounds }) {
    this.#users = userRepository;
    this.#tokens = tokenService;
    this.#bcryptRounds = bcryptRounds;
  }

  /**
   * Creates a new account with a bcrypt-hashed password.
   * @param {{ username: string, password: string }} credentials - already validated and normalized
   * @returns {Promise<User>}
   */
  async register({ username, password }) {
    const passwordHash = await bcrypt.hash(password, this.#bcryptRounds);
    return this.#users.create(new User({ username, passwordHash, createdAt: new Date() }));
  }

  /**
   * Verifies credentials and issues a token on success.
   * @param {{ username: string, password: string }} credentials - already validated and normalized
   * @returns {Promise<{ token: string, user: User }>}
   * @throws {UnauthorizedError} for an unknown username or wrong password — identical either way, so a caller can't tell which
   */
  async login({ username, password }) {
    const user = await this.#users.findByUsername(username);
    const passwordMatches = user !== null && (await bcrypt.compare(password, user.passwordHash));

    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid username or password');
    }

    return { token: this.#tokens.issue(user), user };
  }
}
