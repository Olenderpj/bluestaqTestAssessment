import { User } from './user.model.js';
import { ConflictError } from '../common/errors.js';

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
}
