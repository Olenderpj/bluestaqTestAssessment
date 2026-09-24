import { Note } from './note.model.js';
import { ForbiddenError, NotFoundError } from '../common/errors.js';

/**
 * Business logic for notes: creation and visibility. Knows nothing
 * about HTTP — takes plain data in, returns plain data out.
 */
export class NoteService {
  #notes;

  /** @param {object} deps
   * @param {import('./note.repository.js').NoteRepository} deps.noteRepository
   */
  constructor({ noteRepository }) {
    this.#notes = noteRepository;
  }

  /**
   * Creates a note owned by the caller.
   * @param {{ note: string, sharedWith: string[] }} input - already validated
   * @param {{ userId: string, username: string }} user - the creator, from the gateway headers
   * @param {Date} [now] - creation timestamp; defaults to the current time
   * @returns {Promise<Note>}
   */
  async create({ note, sharedWith }, user, now = new Date()) {
    const draft = Note.create({ note, sharedWith, username: user.username, now });
    return this.#notes.insert(draft);
  }

  /**
   * Lists every note visible to a caller.
   * @param {{ userId: string, username: string }} user
   * @returns {Promise<Note[]>} newest-updated first
   */
  async listVisible(user) {
    return this.#notes.findVisibleTo(user);
  }

  /**
   * Updates a note's text and/or sharing list.
   *
   * A note the caller cannot see returns the same "not found" error as a
   * note that doesn't exist, so its existence is never revealed to
   * someone without access. Only the creator may change `sharedWith`,
   * so a user a note is shared with can't widen its audience.
   * @param {string} id
   * @param {{ note?: string, sharedWith?: string[] }} changes - already validated
   * @param {{ userId: string, username: string }} user - the caller, from the gateway headers
   * @param {Date} [now] - update timestamp; defaults to the current time
   * @returns {Promise<Note>}
   * @throws {NotFoundError} if the note doesn't exist or isn't visible to the caller
   * @throws {ForbiddenError} if the caller isn't the creator but tries to change sharedWith
   */
  async update(id, changes, user, now = new Date()) {
    const existing = await this.#notes.findById(id);
    if (!existing || !existing.isVisibleTo(user)) {
      throw new NotFoundError('Note not found');
    }

    if ('sharedWith' in changes && !existing.isOwnedBy(user.username)) {
      throw new ForbiddenError('Only the note creator can change sharedWith');
    }

    const updated = await this.#notes.update(id, {
      ...changes,
      updatedAt: now,
      updatedBy: user.username,
    });

    if (!updated) {
      throw new NotFoundError('Note not found');
    }

    return updated;
  }
}
