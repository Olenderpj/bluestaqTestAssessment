import { Note } from './note.model.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../common/errors.js';

/**
 * Business logic for notes: creation, visibility, and updates. Knows
 * nothing about HTTP — takes plain data in, returns plain data out.
 */
export class NoteService {
  #notes;
  #users;

  /** @param {object} deps
   * @param {import('./note.repository.js').NoteRepository} deps.noteRepository
   * @param {import('../users/user.repository.js').UserRepository} deps.userRepository - used to reject sharedWith ids that don't belong to a real user
   */
  constructor({ noteRepository, userRepository }) {
    this.#notes = noteRepository;
    this.#users = userRepository;
  }

  /**
   * Rejects a sharedWith list up front if it names a user id that
   * doesn't exist, instead of silently storing it — a typo'd or stale
   * id would otherwise make the note invisible to whoever it was
   * meant for, with no error to explain why.
   * @param {string[]} sharedWith
   * @throws {BadRequestError} if any id has no matching user
   */
  async #assertSharedWithExists(sharedWith) {
    if (sharedWith.length === 0) {
      return;
    }

    const missingIds = await this.#users.findMissingIds(sharedWith);
    if (missingIds.length > 0) {
      throw new BadRequestError(`sharedWith contains unknown user id(s): ${missingIds.join(', ')}`);
    }
  }

  /**
   * Creates a note owned by the caller.
   * @param {{ note: string, sharedWith: string[] }} input - already validated
   * @param {{ userId: string, username: string }} user - the creator, from the gateway headers
   * @param {Date} [now] - creation timestamp; defaults to the current time
   * @returns {Promise<Note>}
   * @throws {BadRequestError} if sharedWith names an id with no matching user
   */
  async create({ note, sharedWith }, user, now = new Date()) {
    await this.#assertSharedWithExists(sharedWith);

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
   * @throws {BadRequestError} if a new sharedWith names an id with no matching user
   */
  async update(id, changes, user, now = new Date()) {
    const existing = await this.#notes.findById(id);
    if (!existing || !existing.isVisibleTo(user)) {
      throw new NotFoundError('Note not found');
    }

    if ('sharedWith' in changes && !existing.isOwnedBy(user.username)) {
      throw new ForbiddenError('Only the note creator can change sharedWith');
    }

    if ('sharedWith' in changes) {
      await this.#assertSharedWithExists(changes.sharedWith);
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
