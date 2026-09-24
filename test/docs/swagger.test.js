import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildOpenApiSpec } from '../../src/docs/swagger.js';
import { User } from '../../src/users/user.model.js';
import { Note } from '../../src/notes/note.model.js';
import { startTestApp } from '../helpers/testApp.js';

test('buildOpenApiSpec documents every endpoint', () => {
  const spec = buildOpenApiSpec();

  assert.equal(spec.openapi, '3.0.3');
  const paths = Object.keys(spec.paths).sort();
  assert.deepEqual(paths, ['/login', '/note', '/notes', '/register']);
  assert.ok(spec.paths['/note'].post, 'POST /note is documented');
  assert.ok(spec.paths['/note'].put, 'PUT /note is documented');
  assert.ok(spec.paths['/notes'].get, 'GET /notes is documented');
  assert.ok(spec.paths['/register'].post, 'POST /register is documented');
  assert.ok(spec.paths['/login'].post, 'POST /login is documented');
});

test('every model has a schema whose properties match its toJSON() keys exactly', () => {
  const spec = buildOpenApiSpec();

  const user = new User({ id: 'a'.repeat(24), username: 'alice', createdAt: new Date() });
  const note = Note.create({ note: 'x', username: 'alice' });
  note.id = 'b'.repeat(24);

  const userSchemaKeys = Object.keys(spec.components.schemas.User.properties).sort();
  const noteSchemaKeys = Object.keys(spec.components.schemas.Note.properties).sort();

  assert.deepEqual(userSchemaKeys, Object.keys(user.toJSON()).sort());
  assert.deepEqual(noteSchemaKeys, Object.keys(note.toJSON()).sort());
});

test('note endpoints require bearer auth in the spec; auth endpoints do not', () => {
  const spec = buildOpenApiSpec();

  assert.deepEqual(spec.paths['/note'].post.security, [{ bearerAuth: [] }]);
  assert.deepEqual(spec.paths['/note'].put.security, [{ bearerAuth: [] }]);
  assert.deepEqual(spec.paths['/notes'].get.security, [{ bearerAuth: [] }]);
  assert.equal(spec.paths['/register'].post.security, undefined);
});

let ctx;

before(async () => {
  ctx = await startTestApp();
});

after(async () => {
  await ctx.stop();
});

test('GET /api-docs.json serves the spec without a token', async () => {
  const res = await request(ctx.app).get('/api-docs.json');

  assert.equal(res.status, 200);
  assert.equal(res.body.info.title, 'Notes Service API');
});

test('GET /api-docs serves the Swagger UI page without a token', async () => {
  const res = await request(ctx.app).get('/api-docs/');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /html/);
});
