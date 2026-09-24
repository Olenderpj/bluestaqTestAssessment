import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestApp } from '../helpers/testApp.js';

let ctx;

before(async () => {
  ctx = await startTestApp();
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  await ctx.reset();
});

const register = (body) => request(ctx.app).post('/register').send(body);
const login = (body) => request(ctx.app).post('/login').send(body);

test('POST /register creates a user and returns it without the password', async () => {
  const res = await register({ username: 'alice', password: 'password123' });

  assert.equal(res.status, 201);
  assert.match(res.body.id, /^[0-9a-f]{24}$/);
  assert.equal(res.body.username, 'alice');
  assert.ok(res.body.createdAt);
  assert.equal(res.body.passwordHash, undefined);
  assert.equal(res.body.password, undefined);
});

test('POST /register stores a bcrypt hash, never the plaintext password', async () => {
  await register({ username: 'alice', password: 'password123' });

  const doc = await ctx.db.collection('users').findOne({ username: 'alice' });
  assert.notEqual(doc.passwordHash, 'password123');
  assert.match(doc.passwordHash, /^\$2[aby]\$/);
});

test('POST /register normalizes username case and rejects case-variant duplicates', async () => {
  const first = await register({ username: '  Alice ', password: 'password123' });
  assert.equal(first.status, 201);
  assert.equal(first.body.username, 'alice');

  const dup = await register({ username: 'ALICE', password: 'password456' });
  assert.equal(dup.status, 409);
  assert.deepEqual(dup.body, { error: 'Username already exists' });
});

test('POST /register validates input', async () => {
  const cases = [
    {},
    { username: 'alice' },
    { password: 'password123' },
    { username: 'alice', password: 12345678 },
    { username: 'al', password: 'password123' },
    { username: 'alice smith', password: 'password123' },
    { username: 'a'.repeat(33), password: 'password123' },
    { username: 'alice', password: 'short' },
    { username: 'alice', password: 'x'.repeat(73) },
  ];

  for (const body of cases) {
    const res = await register(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('POST /register with no body returns 400', async () => {
  const res = await request(ctx.app).post('/register');

  assert.equal(res.status, 400);
});

test('POST /login returns a JWT carrying user id and username', async () => {
  const { body: user } = await register({ username: 'alice', password: 'password123' });

  const res = await login({ username: 'alice', password: 'password123' });
  assert.equal(res.status, 200);

  const decoded = jwt.verify(res.body.token, ctx.config.jwtSecret);
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.username, 'alice');
  assert.deepEqual(res.body.user, user);
});

test('POST /login is case-insensitive on username', async () => {
  await register({ username: 'alice', password: 'password123' });

  const res = await login({ username: 'ALICE', password: 'password123' });
  assert.equal(res.status, 200);
});

test('POST /login rejects wrong password and unknown user identically', async () => {
  await register({ username: 'alice', password: 'password123' });

  const wrongPassword = await login({ username: 'alice', password: 'wrong-password' });
  const unknownUser = await login({ username: 'nobody', password: 'password123' });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.deepEqual(wrongPassword.body, { error: 'Invalid username or password' });
  assert.deepEqual(unknownUser.body, wrongPassword.body);
});

test('POST /login with missing fields returns 400', async () => {
  const res = await login({ username: 'alice' });

  assert.equal(res.status, 400);
});
