import express from 'express';
import { errorHandler, notFoundHandler } from './common/errorHandler.js';
import { UserRepository } from './users/user.repository.js';
import { TokenService } from './auth/token.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { createAuthRouter } from './auth/auth.routes.js';
import { createGateway } from './gateway/gateway.js';
import { NoteRepository } from './notes/note.repository.js';
import { NoteService } from './notes/note.service.js';
import { NotesController } from './notes/note.controller.js';
import { createNotesRouter } from './notes/note.routes.js';

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
  const noteRepository = new NoteRepository(db);
  await Promise.all([userRepository.ensureIndexes(), noteRepository.ensureIndexes()]);

  const tokenService = new TokenService({ secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
  const authService = new AuthService({ userRepository, tokenService, bcryptRounds: config.bcryptRounds });
  const noteService = new NoteService({ noteRepository });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Public routes: no token required.
  app.use(createAuthRouter(new AuthController(authService)));

  // Everything below requires an authenticated user; the gateway sets x-user-id / x-username.
  app.use(createGateway(tokenService));

  app.use(createNotesRouter(new NotesController(noteService)));

  // Module wiring (docs) is added here by later tasks.

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
