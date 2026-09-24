import { Note } from './note.model.js';

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
}
