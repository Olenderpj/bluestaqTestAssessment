import express from 'express';
import { errorHandler, notFoundHandler } from './common/errorHandler.js';
import { UserRepository } from './users/user.repository.js';
import { TokenService } from './auth/token.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { createAuthRouter } from './auth/auth.routes.js';

/**
 * Composition root: builds a fully wired Express app from a database
 * handle and config. Each feature module's dependencies are built here
 * and handed to its router; this file is the only place that knows how
 * modules fit together.
 * @param {{ db: import('mongodb').Db, config: object }} deps
 * @returns {Promise<import('express').Application>}
 */
export async function createApp({ db, config }) {
  const userRepository = new UserRepository(db);
  await userRepository.ensureIndexes();

  const tokenService = new TokenService({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
  const authService = new AuthService({ userRepository, tokenService, bcryptRounds: config.bcryptRounds });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Public routes: no token required.
  app.use(createAuthRouter(new AuthController(authService)));

  // Module wiring (gateway, notes, docs) is added here by later tasks.

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
