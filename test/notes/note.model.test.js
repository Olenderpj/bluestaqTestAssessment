import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Note } from '../../src/notes/note.model.js';

const ALICE = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', username: 'alice' };
const BOB = { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', username: 'bob' };
const CAROL = { userId: 'cccccccccccccccccccccccc', username: 'carol' };

test('Note.create sets audit fields from the username and one timestamp', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  const note = Note.create({ note: 'hello', username: 'alice', now });

  assert.equal(note.note, 'hello');
  assert.equal(note.createdBy, 'alice');
  assert.equal(note.updatedBy, 'alice');
  assert.equal(note.createdAt, now);
  assert.equal(note.updatedAt, now);
  assert.deepEqual(note.sharedWith, []);
});

test('a note with empty sharedWith is visible to everyone', () => {
  const note = Note.create({ note: 'public', username: 'alice' });

  for (const user of [ALICE, BOB, CAROL]) {
    assert.equal(note.isVisibleTo(user), true);
  }
});

test('a restricted note is visible to listed users and its creator only', () => {
  const note = Note.create({ note: 'for bob', sharedWith: [BOB.userId], username: 'alice' });

  assert.equal(note.isVisibleTo(ALICE), true); // creator, even though not listed
  assert.equal(note.isVisibleTo(BOB), true);
  assert.equal(note.isVisibleTo(CAROL), false);
});

test('isOwnedBy compares against createdBy', () => {
  const note = Note.create({ note: 'x', username: 'alice' });

  assert.equal(note.isOwnedBy('alice'), true);
  assert.equal(note.isOwnedBy('bob'), false);
});

test('toJSON has exactly the public note shape', () => {
  const draft = Note.create({ note: 'x', username: 'alice' });
  const note = new Note({ id: 'dddddddddddddddddddddddd', ...draft.toDocument() });

  assert.deepEqual(
    Object.keys(note.toJSON()).sort(),
    ['createdAt', 'createdBy', 'id', 'note', 'sharedWith', 'updatedAt', 'updatedBy'],
  );
});
