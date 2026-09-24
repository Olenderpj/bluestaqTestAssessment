import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createApp } from '../../src/app.js';

/**
 * Starts a fully wired app backed by an in-memory MongoDB instance, for
 * use as a test fixture. Every integration test suite calls this once in
 * a `before` hook and `ctx.stop()` in `after`.
 * @returns {Promise<{
 *   app: import('express').Application,
 *   db: import('mongodb').Db,
 *   config: object,
 *   reset: () => Promise<void>,
 *   stop: () => Promise<void>,
 * }>}
 */
export async function startTestApp() {
  const mongod = await MongoMemoryServer.create();
  const client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db('notes-test');
  const config = { jwtSecret: 'test-secret', jwtExpiresIn: '1h', bcryptRounds: 4 };
  const app = await createApp({ db, config });

  return {
    app,
    db,
    config,

    /** Empties every collection so tests start from a clean database. */
    async reset() {
      const collections = await db.collections();
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
    },

    /** Closes the Mongo connection and stops the in-memory server. */
    async stop() {
      await client.close();
      await mongod.stop();
    },
  };
}
