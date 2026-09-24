import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { startTestApp, registerAndLogin } from '../helpers/testApp.js';

let ctx;
let alice;
let bob;
let carol;

before(async () => {
  ctx = await startTestApp();
});

after(async () => {
  await ctx.stop();
});

beforeEach(async () => {
  await ctx.reset();
  alice = await registerAndLogin(ctx.app, 'alice');
  bob = await registerAndLogin(ctx.app, 'bob');
  carol = await registerAndLogin(ctx.app, 'carol');
});

async function createNote(as, body) {
  const res = await request(ctx.app).post('/note').set(as.auth).send(body).expect(201);
  return res.body;
}

function updateNote(as, body) {
  return request(ctx.app).put('/note').set(as.auth).send(body);
}

async function listTexts(as) {
  const res = await request(ctx.app).get('/notes').set(as.auth).expect(200);
  return res.body.notes.map((note) => note.note);
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

test('PUT /note without a token is 401', async () => {
  await request(ctx.app).put('/note').send({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', note: 'x' }).expect(401);
});

test('creator updates note text: updatedAt/updatedBy change, createdAt/createdBy do not', async () => {
  const original = await createNote(alice, { note: 'v1' });
  await tick();

  const res = await updateNote(alice, { id: original.id, note: 'v2' });

  assert.equal(res.status, 200);
  assert.equal(res.body.note, 'v2');
  assert.equal(res.body.createdAt, original.createdAt);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.ok(Date.parse(res.body.updatedAt) > Date.parse(original.updatedAt));
});

test('another user with access can edit text; updatedBy becomes them, createdBy stays', async () => {
  const original = await createNote(alice, { note: 'public v1' });

  const res = await updateNote(bob, { id: original.id, note: 'bob was here' });

  assert.equal(res.status, 200);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'bob');
});

test('only the creator can change sharedWith', async () => {
  const original = await createNote(alice, { note: 'public' });

  const res = await updateNote(bob, { id: original.id, sharedWith: [bob.userId] });

  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Only the note creator can change sharedWith' });
});

test('creator can make a note private and public again', async () => {
  const original = await createNote(alice, { note: 'secret' });

  const priv = await updateNote(alice, { id: original.id, sharedWith: [alice.userId] });
  assert.equal(priv.status, 200);
  assert.deepEqual(priv.body.sharedWith, [alice.userId]);
  assert.deepEqual(await listTexts(bob), []);
  assert.deepEqual(await listTexts(alice), ['secret']);

  const pub = await updateNote(alice, { id: original.id, sharedWith: [] });
  assert.equal(pub.status, 200);
  assert.deepEqual(await listTexts(bob), ['secret']);
});

test('creator not listed in sharedWith can still update their note', async () => {
  const original = await createNote(alice, { note: 'for bob', sharedWith: [bob.userId] });

  const res = await updateNote(alice, { id: original.id, note: 'for bob v2' });

  assert.equal(res.status, 200);
});

test('a user without access gets 404, not 403, and nothing changes', async () => {
  const original = await createNote(alice, { note: 'for bob', sharedWith: [bob.userId] });

  const res = await updateNote(carol, { id: original.id, note: 'carol edit' });

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Note not found' });

  const stored = await ctx.db.collection('notes').findOne({ _id: new ObjectId(original.id) });
  assert.equal(stored.note, 'for bob');
});

test('immutable / backend-owned fields in the body are rejected and nothing changes', async () => {
  const original = await createNote(alice, { note: 'v1' });

  const disallowedFieldCases = [
    { createdBy: 'mallory' },
    { createdAt: '1999-01-01T00:00:00.000Z' },
    { updatedBy: 'mallory' },
    { updatedAt: '1999-01-01T00:00:00.000Z' },
  ];

  for (const extra of disallowedFieldCases) {
    const res = await updateNote(alice, { id: original.id, note: 'v2', ...extra });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(extra)}`);
  }

  const stored = await ctx.db.collection('notes').findOne({ _id: new ObjectId(original.id) });
  assert.equal(stored.note, 'v1');
  assert.equal(stored.createdBy, 'alice');
  assert.equal(stored.createdAt.toISOString(), original.createdAt);
});

test('PUT /note validates id and payload', async () => {
  const original = await createNote(alice, { note: 'v1' });

  const cases = [
    { note: 'no id' },
    { id: 'not-an-id', note: 'x' },
    { id: 123, note: 'x' },
    { id: original.id },
    { id: original.id, note: '' },
    { id: original.id, sharedWith: ['bad'] },
    { id: original.id, sharedWith: null },
  ];

  for (const body of cases) {
    const res = await updateNote(alice, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('PUT /note for a well-formed but missing id is 404', async () => {
  const res = await updateNote(alice, { id: 'ffffffffffffffffffffffff', note: 'x' });

  assert.equal(res.status, 404);
});
