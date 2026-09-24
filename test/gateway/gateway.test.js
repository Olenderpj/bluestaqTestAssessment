import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createGateway } from '../../src/gateway/gateway.js';
import { getRequestUser } from '../../src/gateway/userHeaders.js';
import { TokenService } from '../../src/auth/token.service.js';
import { errorHandler } from '../../src/common/errorHandler.js';
import { startTestApp, registerAndLogin } from '../helpers/testApp.js';

const tokens = new TokenService({ secret: 'gw-secret', expiresIn: '1h' });
const alice = { id: '507f1f77bcf86cd799439011', username: 'alice' };

/** A minimal app that echoes the identity the gateway sets, for unit-level gateway tests. */
function probeApp() {
  const app = express();
  app.use(createGateway(tokens));
  app.get('/whoami', (req, res) => {
    res.json({
      headers: { 'x-user-id': req.get('x-user-id'), 'x-username': req.get('x-username') },
      user: getRequestUser(req),
    });
  });
  app.use(errorHandler);
  return app;
}

test('request without Authorization header is rejected', async () => {
  const res = await request(probeApp()).get('/whoami');

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Missing or malformed Authorization header' });
});

test('non-Bearer Authorization header is rejected', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', `Token ${tokens.issue(alice)}`);

  assert.equal(res.status, 401);
});

test('invalid token is rejected', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', 'Bearer nope');

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'Invalid or expired token' });
});

test('spoofed identity headers without a token are rejected', async () => {
  const res = await request(probeApp())
    .get('/whoami')
    .set('x-user-id', alice.id)
    .set('x-username', 'alice');

  assert.equal(res.status, 401);
});

test('valid token sets x-user-id and x-username headers', async () => {
  const res = await request(probeApp()).get('/whoami').set('Authorization', `Bearer ${tokens.issue(alice)}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.headers, { 'x-user-id': alice.id, 'x-username': 'alice' });
  assert.deepEqual(res.body.user, { userId: alice.id, username: 'alice' });
});

test('spoofed identity headers are overwritten by the token identity', async () => {
  const res = await request(probeApp())
    .get('/whoami')
    .set('Authorization', `Bearer ${tokens.issue(alice)}`)
    .set('x-user-id', 'ffffffffffffffffffffffff')
    .set('x-username', 'mallory');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { userId: alice.id, username: 'alice' });
});

test('getRequestUser throws Unauthorized when headers are absent', () => {
  const req = { get: () => undefined };

  assert.throws(() => getRequestUser(req), { status: 401 });
});

// Integration: the gateway protects everything after the public routes.
let ctx;

before(async () => {
  ctx = await startTestApp();
});

after(async () => {
  await ctx.stop();
});

test('app: public routes stay reachable without a token', async () => {
  await request(ctx.app).get('/health').expect(200);
});

test('app: unknown route without token is 401, with token is 404', async () => {
  await request(ctx.app).get('/does-not-exist').expect(401);

  const { auth } = await registerAndLogin(ctx.app, 'gwuser');
  await request(ctx.app).get('/does-not-exist').set(auth).expect(404);
});
