/**
 * A shared or private note. Matches the note document shape from the
 * spec: `{note, createdAt, updatedAt, createdBy, updatedBy, sharedWith}`.
 */
export class Note {
  /**
   * @param {object} fields
   * @param {string} [fields.id] - 24-char hex id; absent until persisted
   * @param {string} fields.note - the note text
   * @param {Date} fields.createdAt - immutable; set once at creation
   * @param {Date} fields.updatedAt - bumped on every edit
   * @param {string} fields.createdBy - username of the creator; immutable
   * @param {string} fields.updatedBy - username of the last editor
   * @param {string[]} [fields.sharedWith] - user ids allowed to see the note; empty means everyone
   */
  constructor({ id, note, createdAt, updatedAt, createdBy, updatedBy, sharedWith = [] }) {
    this.id = id;
    this.note = note;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.sharedWith = sharedWith;
  }

  /**
   * Builds a brand-new note. Creator and creation time also become the
   * initial updater and update time, so a freshly created note always
   * has createdAt === updatedAt and createdBy === updatedBy.
   * @param {object} fields
   * @param {string} fields.note - note text
   * @param {string[]} [fields.sharedWith] - user ids to restrict visibility to
   * @param {string} fields.username - creator's username, from the gateway headers
   * @param {Date} [fields.now] - creation timestamp; defaults to the current time
   * @returns {Note}
   */
  static create({ note, sharedWith = [], username, now = new Date() }) {
    return new Note({
      note,
      sharedWith,
      createdAt: now,
      updatedAt: now,
      createdBy: username,
      updatedBy: username,
    });
  }

  /**
   * Builds a Note from a raw MongoDB document.
   * @param {import('mongodb').WithId<object>} doc
   * @returns {Note}
   */
  static fromDocument(doc) {
    return new Note({
      id: doc._id.toHexString(),
      note: doc.note,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
      updatedBy: doc.updatedBy,
      sharedWith: doc.sharedWith ?? [],
    });
  }

  /**
   * Whether a given caller is allowed to see this note.
   * @param {{ userId: string, username: string }} caller
   * @returns {boolean} true if sharedWith is empty (public), the caller's id is listed, or the caller created the note
   */
  isVisibleTo({ userId, username }) {
    const isPublic = this.sharedWith.length === 0;
    const isExplicitlyShared = this.sharedWith.includes(userId);

    // The creator can always see their own note, even if their id isn't in sharedWith.
    return isPublic || isExplicitlyShared || this.isOwnedBy(username);
  }

  /**
   * @param {string} username
   * @returns {boolean} true if `username` created this note
   */
  isOwnedBy(username) {
    return this.createdBy === username;
  }

  /**
   * Shape written to MongoDB. Excludes `id`, since Mongo assigns `_id`.
   * @returns {{ note: string, createdAt: Date, updatedAt: Date, createdBy: string, updatedBy: string, sharedWith: string[] }}
   */
  toDocument() {
    return {
      note: this.note,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
      sharedWith: this.sharedWith,
    };
  }

  /** Public shape sent to clients: the document plus its id. */
  toJSON() {
    return { id: this.id, ...this.toDocument() };
  }
}
