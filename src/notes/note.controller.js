import { getRequestUser } from '../gateway/userHeaders.js';
import { validateCreateNote } from './note.validation.js';

/**
 * HTTP layer for notes: reads the request, calls validation and
 * NoteService, and shapes the response. Holds no business rules.
 */
export class NotesController {
  #notes;

  /** @param {import('./note.service.js').NoteService} noteService */
  constructor(noteService) {
    this.#notes = noteService;
  }

  /** POST /note — creates a note owned by the authenticated caller. */
  create = async (req, res) => {
    const user = getRequestUser(req);
    const note = await this.#notes.create(validateCreateNote(req.body), user);
    res.status(201).json(note);
  };

  /** GET /notes — lists every note visible to the authenticated caller. */
  list = async (req, res) => {
    const notes = await this.#notes.listVisible(getRequestUser(req));
    res.json({ notes });
  };
}
