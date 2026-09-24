import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { User } from '../../src/users/user.model.js';
import { UserRepository } from '../../src/users/user.repository.js';
import { ConflictError } from '../../src/common/errors.js';

let mongod;
let client;
let db;
let repo;

before(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  db = client.db('users-test');
  repo = new UserRepository(db);
  await repo.ensureIndexes();
});

after(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await db.collection('users').deleteMany({});
});

/** Builds a User with sensible defaults, overridable per test. */
function makeUser(username = 'alice') {
  return new User({ username, passwordHash: '$2a$04$hash', createdAt: new Date('2026-01-01T00:00:00Z') });
}

test('normalizeUsername trims and lowercases', () => {
  assert.equal(User.normalizeUsername('  Alice '), 'alice');
});

test('create stores the user and returns it with an id', async () => {
  const created = await repo.create(makeUser());

  assert.match(created.id, /^[0-9a-f]{24}$/);
  assert.equal(created.username, 'alice');

  const doc = await db.collection('users').findOne({ username: 'alice' });
  assert.equal(doc._id.toHexString(), created.id);
  assert.equal(doc.passwordHash, '$2a$04$hash');
});

test('create rejects duplicate usernames with ConflictError', async () => {
  await repo.create(makeUser());

  await assert.rejects(() => repo.create(makeUser()), ConflictError);
});

test('findByUsername returns a User or null', async () => {
  const created = await repo.create(makeUser());

  const found = await repo.findByUsername('alice');
  assert.ok(found instanceof User);
  assert.equal(found.id, created.id);

  assert.equal(await repo.findByUsername('nobody'), null);
});

test('toJSON never exposes passwordHash', async () => {
  const created = await repo.create(makeUser());

  const json = JSON.parse(JSON.stringify(created));
  assert.deepEqual(Object.keys(json).sort(), ['createdAt', 'id', 'username']);
});
