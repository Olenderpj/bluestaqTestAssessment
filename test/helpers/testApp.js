import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import request from 'supertest';
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

/**
 * Registers and logs in a fresh user against a running test app, and
 * returns everything a test needs to act as that user.
 * @param {import('express').Application} app - the app under test
 * @param {string} username - username to register
 * @param {string} [password] - password to register and log in with
 * @returns {Promise<{ userId: string, username: string, token: string, auth: { Authorization: string } }>}
 */
export async function registerAndLogin(app, username, password = 'password123') {
  const registered = await request(app).post('/register').send({ username, password }).expect(201);
  const loggedIn = await request(app).post('/login').send({ username, password }).expect(200);

  return {
    userId: registered.body.id,
    username: registered.body.username,
    token: loggedIn.body.token,
    auth: { Authorization: `Bearer ${loggedIn.body.token}` },
  };
}
