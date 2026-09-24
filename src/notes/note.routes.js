import { Router } from 'express';

/**
 * Builds the router for the authenticated note endpoints. Every route
 * here runs after the gateway, so `req` always carries the caller's
 * identity headers by the time a controller method sees it.
 * @param {import('./note.controller.js').NotesController} controller - handles the HTTP layer for notes
 * @returns {import('express').Router} router with POST/GET/PUT for notes
 */
export function createNotesRouter(controller) {
  const router = Router();

  /**
   * @openapi
   * /note:
   *   post:
   *     summary: Create a note
   *     tags: [Notes]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateNoteRequest'
   *     responses:
   *       201:
   *         description: Note created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Note'
   *       400:
   *         description: Invalid note text or sharedWith
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Missing or invalid token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.post('/note', controller.create);

  /**
   * @openapi
   * /notes:
   *   get:
   *     summary: List every note visible to the caller
   *     tags: [Notes]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200:
   *         description: Public notes, notes shared with the caller, and the caller's own notes, newest first
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/NotesListResponse'
   *       401:
   *         description: Missing or invalid token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.get('/notes', controller.list);

  /**
   * @openapi
   * /note:
   *   put:
   *     summary: Update a note's text or sharing list
   *     tags: [Notes]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateNoteRequest'
   *     responses:
   *       200:
   *         description: Note updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Note'
   *       400:
   *         description: Invalid id, payload, or an attempt to set a backend-owned field
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       401:
   *         description: Missing or invalid token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       403:
   *         description: Attempted to change sharedWith on a note the caller didn't create
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Note not found, or not visible to the caller
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  router.put('/note', controller.update);

  return router;
}
