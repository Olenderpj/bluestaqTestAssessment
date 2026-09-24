import { Router } from 'express';

/**
 * Builds the router for the public authentication endpoints.
 * @param {import('./auth.controller.js').AuthController} controller
 * @returns {import('express').Router} router with POST /register and POST /login
 */
export function createAuthRouter(controller) {
  const router = Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);

  return router;
}
