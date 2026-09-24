import express from 'express';
import { errorHandler, notFoundHandler } from './common/errorHandler.js';

/**
 * Composition root: builds a fully wired Express app from a database
 * handle and config. Later tasks add each feature module's router here;
 * this file is the only place that knows how modules fit together.
 * @param {{ db: import('mongodb').Db, config: object }} deps
 * @returns {Promise<import('express').Application>}
 */
export async function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Module wiring (auth, gateway, notes, docs) is added here by later tasks.

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
