/**
 * A registered account. Stores the bcrypt hash, never the plaintext
 * password, and `toJSON()` drops the hash too so a User can never leak
 * it through `res.json(user)`.
 */
export class User {
  /**
   * @param {object} fields
   * @param {string} [fields.id] - 24-char hex id; absent until persisted
   * @param {string} fields.username - normalized (trimmed, lowercased) username
   * @param {string} fields.passwordHash - bcrypt hash of the password
   * @param {Date} fields.createdAt - when the account was created
   */
  constructor({ id, username, passwordHash, createdAt }) {
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.createdAt = createdAt;
  }

  /**
   * Normalizes a raw username the same way everywhere it's read or
   * written, so "Alice" and "alice" are always treated as one account.
   * @param {string} username
   * @returns {string} trimmed, lowercased username
   */
  static normalizeUsername(username) {
    return username.trim().toLowerCase();
  }

  /**
   * Builds a User from a raw MongoDB document.
   * @param {import('mongodb').WithId<object>} doc
   * @returns {User}
   */
  static fromDocument(doc) {
    return new User({
      id: doc._id.toHexString(),
      username: doc.username,
      passwordHash: doc.passwordHash,
      createdAt: doc.createdAt,
    });
  }

  /**
   * Shape written to MongoDB. Excludes `id`, since Mongo assigns `_id`.
   * @returns {{ username: string, passwordHash: string, createdAt: Date }}
   */
  toDocument() {
    return {
      username: this.username,
      passwordHash: this.passwordHash,
      createdAt: this.createdAt,
    };
  }

  /**
   * Public shape sent to clients. Deliberately omits `passwordHash`.
   * @returns {{ id: string, username: string, createdAt: Date }}
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      createdAt: this.createdAt,
    };
  }
}
