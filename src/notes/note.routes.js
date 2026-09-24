import { Router } from 'express';

/**
 * Builds the router for the authenticated note endpoints. Every route
 * here runs after the gateway, so `req` always carries the caller's
 * identity headers by the time a controller method sees it.
 * @param {import('./note.controller.js').NotesController} controller
 * @returns {import('express').Router} router with POST/GET for notes
 */
export function createNotesRouter(controller) {
  const router = Router();

  router.post('/note', controller.create);
  router.get('/notes', controller.list);

  return router;
}
