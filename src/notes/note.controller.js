import { getRequestUser } from '../gateway/userHeaders.js';
import { validateCreateNote, validateUpdateNote } from './note.validation.js';

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

  /** PUT /note — updates a note's text and/or sharing list. */
  update = async (req, res) => {
    const { id, changes } = validateUpdateNote(req.body);
    const note = await this.#notes.update(id, changes, getRequestUser(req));
    res.json(note);
  };
}
