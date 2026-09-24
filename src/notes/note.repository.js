import { ObjectId } from 'mongodb';
import { Note } from './note.model.js';
import { isObjectIdString } from '../common/objectId.js';

// The only fields an update is ever allowed to write. createdBy/createdAt
// are deliberately excluded so they can never be overwritten here, even
// if a caller accidentally passes them through.
const UPDATABLE_FIELDS = ['note', 'sharedWith', 'updatedAt', 'updatedBy'];

/**
 * Builds the MongoDB filter matching Note#isVisibleTo, so the database
 * applies the exact same visibility rule as the model.
 * @param {{ userId: string, username: string }} user
 * @returns {object} a MongoDB query filter
 */
function visibleTo({ userId, username }) {
  return {
    $or: [
      { sharedWith: { $size: 0 } },
      { sharedWith: userId },
      { createdBy: username },
    ],
  };
}

/**
 * The only class that talks to the `notes` collection.
 */
export class NoteRepository {
  #collection;

  /** @param {import('mongodb').Db} db */
  constructor(db) {
    this.#collection = db.collection('notes');
  }

  /**
   * Creates the indexes that keep visibility lookups and creator-owned
   * updates fast.
   * @returns {Promise<void>}
   */
  async ensureIndexes() {
    await this.#collection.createIndexes([
      { key: { sharedWith: 1 } },
      { key: { createdBy: 1 } },
      { key: { updatedAt: -1 } },
    ]);
  }

  /**
   * Persists a new note.
   * @param {Note} note - a Note without an `id` yet
   * @returns {Promise<Note>} the same note, with `id` set
   */
  async insert(note) {
    const doc = note.toDocument();
    const { insertedId } = await this.#collection.insertOne(doc);
    return new Note({ ...doc, id: insertedId.toHexString() });
  }

  /**
   * Looks up a note by id, regardless of visibility.
   * @param {string} id
   * @returns {Promise<Note | null>} null for a missing note or a malformed id
   */
  async findById(id) {
    if (!isObjectIdString(id)) {
      return null;
    }

    const doc = await this.#collection.findOne({ _id: new ObjectId(id) });
    return doc ? Note.fromDocument(doc) : null;
  }

  /**
   * Finds every note visible to a caller: public, shared with them, or
   * created by them.
   * @param {{ userId: string, username: string }} user
   * @returns {Promise<Note[]>} newest-updated first
   */
  async findVisibleTo(user) {
    const docs = await this.#collection
      .find(visibleTo(user))
      .sort({ updatedAt: -1, _id: -1 })
      .toArray();

    return docs.map((doc) => Note.fromDocument(doc));
  }

  /**
   * Applies an update, writing only the allowed fields.
   * @param {string} id
   * @param {{ note?: string, sharedWith?: string[], updatedAt: Date, updatedBy: string }} changes
   * @returns {Promise<Note | null>} the updated note, or null if it doesn't exist
   */
  async update(id, changes) {
    if (!isObjectIdString(id)) {
      return null;
    }

    const allowedChanges = Object.entries(changes).filter(([key]) => UPDATABLE_FIELDS.includes(key));
    const $set = Object.fromEntries(allowedChanges);

    const doc = await this.#collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set },
      { returnDocument: 'after' },
    );

    return doc ? Note.fromDocument(doc) : null;
  }
}
