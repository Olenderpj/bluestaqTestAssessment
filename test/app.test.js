import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startTestApp } from './helpers/testApp.js';
import { isObjectIdString } from '../src/common/objectId.js';

let ctx;

before(async () => {
  ctx = await startTestApp();
});

after(async () => {
  await ctx.stop();
});

test('GET /health returns ok', async () => {
  const res = await request(ctx.app).get('/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('malformed JSON body returns 400 JSON error', async () => {
  const res = await request(ctx.app)
    .post('/health')
    .set('Content-Type', 'application/json')
    .send('{"bad"');

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Malformed JSON body' });
});

test('x-powered-by header is not sent', async () => {
  const res = await request(ctx.app).get('/health');

  assert.equal(res.headers['x-powered-by'], undefined);
});

test('isObjectIdString accepts only 24-char hex strings', () => {
  assert.equal(isObjectIdString('507f1f77bcf86cd799439011'), true);
  assert.equal(isObjectIdString('507F1F77BCF86CD799439011'), true);
  assert.equal(isObjectIdString('abc'), false);
  // 12 chars is a valid ObjectId.isValid() input (12-byte raw form), but not a hex string we accept.
  assert.equal(isObjectIdString('aaaaaaaaaaaa'), false);
  assert.equal(isObjectIdString(123), false);
  assert.equal(isObjectIdString(null), false);
});
