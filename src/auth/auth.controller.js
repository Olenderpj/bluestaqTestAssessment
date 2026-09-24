import { validateLogin, validateRegistration } from './auth.validation.js';

/**
 * HTTP layer for authentication: reads the request, calls validation
 * and AuthService, and shapes the response. Holds no business rules.
 */
export class AuthController {
  #auth;

  /** @param {import('./auth.service.js').AuthService} authService */
  constructor(authService) {
    this.#auth = authService;
  }

  /**
   * POST /register — creates a new account.
   * Arrow-function property (not a prototype method) so `this` stays
   * bound when Express calls it directly as a route handler.
   */
  register = async (req, res) => {
    const user = await this.#auth.register(validateRegistration(req.body));
    res.status(201).json(user);
  };

  /** POST /login — verifies credentials and returns a JWT plus the user. */
  login = async (req, res) => {
    const { token, user } = await this.#auth.login(validateLogin(req.body));
    res.json({ token, user });
  };
}
