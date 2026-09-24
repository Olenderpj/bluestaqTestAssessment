import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { Note } from '../../src/notes/note.model.js';
import { NoteRepository } from '../../src/notes/note.repository.js';

const ALICE = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'alice' };
const BOB = { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'bob' };
const CAROL = { userId: 'cccccccccccccccccccccccc', username: 'carol' };

let mongod;
let client;
let db;
let repo;

before(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  db = client.db('notes-repo-test');
  repo = new NoteRepository(db);
  await repo.ensureIndexes();
});

after(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await db.collection('notes').deleteMany({});
});

test('insert stores the spec document shape and returns a Note with id', async () => {
  const saved = await repo.insert(Note.create({ note: 'hi', username: 'alice' }));

  assert.match(saved.id, /^[0-9a-f]{24}$/);

  const doc = await db.collection('notes').findOne({});
  assert.deepEqual(
    Object.keys(doc).sort(),
    ['_id', 'createdAt', 'createdBy', 'note', 'sharedWith', 'updatedAt', 'updatedBy'],
  );
  assert.ok(doc.createdAt instanceof Date);
});

test('findById returns the note, or null for missing / malformed ids', async () => {
  const saved = await repo.insert(Note.create({ note: 'hi', username: 'alice' }));

  assert.equal((await repo.findById(saved.id)).note, 'hi');
  assert.equal(await repo.findById('ffffffffffffffffffffffff'), null);
  assert.equal(await repo.findById('not-an-id'), null);
  assert.equal(await repo.findById('aaaaaaaaaaaa'), null);
});

test('findVisibleTo applies the public / shared / creator rules', async () => {
  await repo.insert(Note.create({ note: 'public', username: 'alice' }));
  await repo.insert(Note.create({ note: 'alice-to-bob', sharedWith: [BOB.userId], username: 'alice' }));
  await repo.insert(Note.create({ note: 'alice-private', sharedWith: [ALICE.userId], username: 'alice' }));

  async function visibleNoteTexts(user) {
    const notes = await repo.findVisibleTo(user);
    return notes.map((note) => note.note).sort();
  }

  assert.deepEqual(await visibleNoteTexts(ALICE), ['alice-private', 'alice-to-bob', 'public']);
  assert.deepEqual(await visibleNoteTexts(BOB), ['alice-to-bob', 'public']);
  assert.deepEqual(await visibleNoteTexts(CAROL), ['public']);
});

test('findVisibleTo sorts by updatedAt descending', async () => {
  await repo.insert(Note.create({ note: 'old', username: 'alice', now: new Date('2026-01-01') }));
  await repo.insert(Note.create({ note: 'new', username: 'alice', now: new Date('2026-06-01') }));

  const notes = await repo.findVisibleTo(ALICE);

  assert.deepEqual(notes.map((note) => note.note), ['new', 'old']);
});

test('update changes only the allowed fields and returns the updated note', async () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const saved = await repo.insert(Note.create({ note: 'v1', username: 'alice', now: created }));

  const later = new Date('2026-02-01T00:00:00Z');
  const updated = await repo.update(saved.id, {
    note: 'v2',
    updatedAt: later,
    updatedBy: 'bob',
    createdBy: 'mallory', // must be ignored: createdBy is immutable
    createdAt: new Date('1999-01-01'), // must be ignored: createdAt is immutable
  });

  assert.equal(updated.note, 'v2');
  assert.equal(updated.updatedBy, 'bob');
  assert.deepEqual(updated.updatedAt, later);
  assert.equal(updated.createdBy, 'alice');
  assert.deepEqual(updated.createdAt, created);
});

test('update returns null for a missing note', async () => {
  const result = await repo.update('ffffffffffffffffffffffff', {
    note: 'x',
    updatedAt: new Date(),
    updatedBy: 'a',
  });

  assert.equal(result, null);
});
