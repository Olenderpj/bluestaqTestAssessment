import { HttpError } from './errors.js';

/**
 * Catches any request that didn't match a route. Mounted last, after
 * every module's router.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Express's central error handler. Express recognizes it as an error
 * handler by its four-argument signature, so `next` must stay even
 * though it's never called.
 * @param {Error} err - the thrown or forwarded error
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // express.json() throws these shapes for a malformed or oversized body.
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
