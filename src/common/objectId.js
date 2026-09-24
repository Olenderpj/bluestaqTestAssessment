const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Checks whether a value is a 24-character hex string, the only id shape
 * this service accepts from clients. Deliberately stricter than
 * MongoDB's `ObjectId.isValid`, which also accepts 12-byte raw strings
 * and numbers — inputs we never want to treat as ids.
 * @param {unknown} value - candidate id
 * @returns {boolean} true only for a 24-character hex string
 */
export function isObjectIdString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return OBJECT_ID_PATTERN.test(value);
}
