import { BadRequestError } from '../common/errors.js';
import { isObjectIdString } from '../common/objectId.js';

const MAX_NOTE_LENGTH = 10_000;
// The only fields PUT /note is allowed to change. createdBy/createdAt
// are immutable, and updatedAt/updatedBy always come from the server.
const UPDATABLE_FIELDS = ['note', 'sharedWith'];

/**
 * Validates note text shared by create and update.
 * @param {unknown} value
 * @returns {string}
 * @throws {BadRequestError} if not a non-empty string within the length limit
 */
function parseNoteText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestError('note must be a non-empty string');
  }

  if (value.length > MAX_NOTE_LENGTH) {
    throw new BadRequestError(`note must be at most ${MAX_NOTE_LENGTH} characters`);
  }

  return value;
}

/**
 * Validates a sharedWith array shared by create and update.
 * @param {unknown} value
 * @returns {string[]} normalized (lowercased), deduplicated user ids
 * @throws {BadRequestError} if not an array of valid ids
 */
function parseSharedWith(value) {
  if (!Array.isArray(value) || !value.every(isObjectIdString)) {
    throw new BadRequestError('sharedWith must be an array of user ids');
  }

  const normalizedIds = value.map((id) => id.toLowerCase());
  return [...new Set(normalizedIds)];
}

/**
 * Validates a POST /note request body.
 * @param {unknown} body
 * @returns {{ note: string, sharedWith: string[] }}
 * @throws {BadRequestError} for invalid note text or sharedWith
 */
export function validateCreateNote(body) {
  const { note, sharedWith = [] } = body ?? {};

  return {
    note: parseNoteText(note),
    sharedWith: parseSharedWith(sharedWith),
  };
}

/**
 * Validates a PUT /note request body. Rejects any field other than
 * `id`, `note`, and `sharedWith` outright, so a client can never sneak
 * `createdBy`/`createdAt`/`updatedAt`/`updatedBy` through.
 * @param {unknown} body
 * @returns {{ id: string, changes: { note?: string, sharedWith?: string[] } }}
 * @throws {BadRequestError} for a missing/invalid id, a disallowed field, or no changes at all
 */
export function validateUpdateNote(body) {
  const { id, ...fields } = body ?? {};

  if (!isObjectIdString(id)) {
    throw new BadRequestError('id must be a valid note id');
  }

  const disallowedFields = Object.keys(fields).filter((key) => !UPDATABLE_FIELDS.includes(key));
  if (disallowedFields.length > 0) {
    throw new BadRequestError(`Only note and sharedWith can be updated; not allowed: ${disallowedFields.join(', ')}`);
  }

  const changes = {};
  if ('note' in fields) {
    changes.note = parseNoteText(fields.note);
  }
  if ('sharedWith' in fields) {
    changes.sharedWith = parseSharedWith(fields.sharedWith);
  }

  if (Object.keys(changes).length === 0) {
    throw new BadRequestError('Provide note and/or sharedWith to update');
  }

  return { id: id.toLowerCase(), changes };
}
