import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
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

const createNote = (as, body) => request(ctx.app).post('/note').set(as.auth).send(body);
const listNotes = (as) => request(ctx.app).get('/notes').set(as.auth);

test('POST /note without a token is 401', async () => {
  const res = await request(ctx.app).post('/note').send({ note: 'hi' });

  assert.equal(res.status, 401);
});

test('POST /note creates a public note with audit fields from the gateway headers', async () => {
  const res = await createNote(alice, { note: 'hello teams' });

  assert.equal(res.status, 201);
  assert.match(res.body.id, /^[0-9a-f]{24}$/);
  assert.equal(res.body.note, 'hello teams');
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.deepEqual(res.body.sharedWith, []);
  assert.ok(!Number.isNaN(Date.parse(res.body.createdAt)));
  assert.equal(res.body.createdAt, res.body.updatedAt);
});

test('POST /note ignores client-supplied audit fields', async () => {
  const res = await createNote(alice, {
    note: 'hi',
    createdBy: 'mallory',
    updatedBy: 'mallory',
    createdAt: '1999-01-01T00:00:00.000Z',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.createdBy, 'alice');
  assert.equal(res.body.updatedBy, 'alice');
  assert.notEqual(res.body.createdAt, '1999-01-01T00:00:00.000Z');
});

test('POST /note normalizes and deduplicates sharedWith ids', async () => {
  const upper = bob.userId.toUpperCase();

  const res = await createNote(alice, { note: 'x', sharedWith: [upper, bob.userId] });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body.sharedWith, [bob.userId]);
});

test('POST /note validates input', async () => {
  const cases = [
    {},
    { note: '' },
    { note: '   ' },
    { note: 42 },
    { note: 'x'.repeat(10_001) },
    { note: 'x', sharedWith: 'bob' },
    { note: 'x', sharedWith: ['not-an-id'] },
    { note: 'x', sharedWith: [123] },
    { note: 'x', sharedWith: ['aaaaaaaaaaaa'] },
  ];

  for (const body of cases) {
    const res = await createNote(alice, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 60)}`);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('GET /notes without a token is 401', async () => {
  await request(ctx.app).get('/notes').expect(401);
});

test('GET /notes returns public notes, notes shared with the caller, and own notes', async () => {
  await createNote(alice, { note: 'public' });
  await createNote(alice, { note: 'alice-to-bob', sharedWith: [bob.userId] });
  await createNote(alice, { note: 'alice-private', sharedWith: [alice.userId] });
  await createNote(carol, { note: 'carol-to-bob-and-carol', sharedWith: [bob.userId, carol.userId] });

  async function visibleNoteTexts(as) {
    const res = await listNotes(as);
    assert.equal(res.status, 200);
    return res.body.notes.map((note) => note.note).sort();
  }

  assert.deepEqual(await visibleNoteTexts(alice), ['alice-private', 'alice-to-bob', 'public']);
  assert.deepEqual(await visibleNoteTexts(bob), ['alice-to-bob', 'carol-to-bob-and-carol', 'public']);
  assert.deepEqual(await visibleNoteTexts(carol), ['carol-to-bob-and-carol', 'public']);
});

test('GET /notes returns newest first with the full note shape', async () => {
  await createNote(alice, { note: 'first' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await createNote(alice, { note: 'second' });

  const res = await listNotes(bob);

  assert.deepEqual(res.body.notes.map((note) => note.note), ['second', 'first']);
  assert.deepEqual(
    Object.keys(res.body.notes[0]).sort(),
    ['createdAt', 'createdBy', 'id', 'note', 'sharedWith', 'updatedAt', 'updatedBy'],
  );
});
