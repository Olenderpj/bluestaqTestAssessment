import { ObjectId } from 'mongodb';
import { User } from './user.model.js';
import { ConflictError } from '../common/errors.js';
import { isObjectIdString } from '../common/objectId.js';

// MongoDB's duplicate-key error code, used to detect a unique-index violation.
const DUPLICATE_KEY_ERROR = 11000;

/**
 * The only class that talks to the `users` collection. Everything else
 * that needs user data goes through this repository, never through
 * MongoDB directly.
 */
export class UserRepository {
  #collection;

  /** @param {import('mongodb').Db} db */
  constructor(db) {
    this.#collection = db.collection('users');
  }

  /**
   * Creates the unique index on `username` that enforces one account
   * per (normalized) username at the database level.
   * @returns {Promise<void>}
   */
  async ensureIndexes() {
    await this.#collection.createIndex({ username: 1 }, { unique: true });
  }

  /**
   * Persists a new user.
   * @param {User} user - a User without an `id` yet
   * @returns {Promise<User>} the same user, with `id` set
   * @throws {ConflictError} if the username is already taken
   */
  async create(user) {
    try {
      const { insertedId } = await this.#collection.insertOne(user.toDocument());
      return new User({ ...user.toDocument(), id: insertedId.toHexString() });
    } catch (err) {
      if (err.code === DUPLICATE_KEY_ERROR) {
        throw new ConflictError('Username already exists');
      }
      throw err;
    }
  }

  /**
   * Looks up a user by their exact (already-normalized) username.
   * @param {string} username
   * @returns {Promise<User | null>}
   */
  async findByUsername(username) {
    const doc = await this.#collection.findOne({ username });

    if (!doc) {
      return null;
    }

    return User.fromDocument(doc);
  }

  /**
   * Checks which of a list of user ids do not belong to a real account.
   * Used to reject a note's `sharedWith` list up front, instead of
   * silently accepting a typo'd or stale id that would make the note
   * invisible to the person it was meant for.
   * @param {string[]} ids
   * @returns {Promise<string[]>} the subset of `ids` with no matching user; a malformed id is always reported as missing
   */
  async findMissingIds(ids) {
    const wellFormedIds = ids.filter(isObjectIdString);

    const existingDocs = await this.#collection
      .find({ _id: { $in: wellFormedIds.map((id) => new ObjectId(id)) } })
      .project({ _id: 1 })
      .toArray();

    // toHexString() is always lowercase; normalize both sides so a
    // caller passing mixed-case ids still gets an accurate result.
    const existingIds = new Set(existingDocs.map((doc) => doc._id.toHexString()));

    return ids.filter((id) => !existingIds.has(id.toLowerCase()));
  }
}
