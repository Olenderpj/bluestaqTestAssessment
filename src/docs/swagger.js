import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJSDoc from 'swagger-jsdoc';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(currentDir, '..');

/**
 * Everything in the OpenAPI document that isn't scanned from JSDoc
 * comments: title, version, and the bearer-token security scheme that
 * route docs reference by name.
 */
const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'Notes Service API',
    version: '1.0.0',
    description: 'Shared note-taking microservice: registration, login, and gateway-protected notes.',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

/**
 * Builds the full OpenAPI 3 document by combining `swaggerDefinition` with
 * every `@openapi` JSDoc comment found in the route and schema files.
 * @returns {object} an OpenAPI 3 document, servable as JSON or through swagger-ui-express
 */
export function buildOpenApiSpec() {
  const options = {
    definition: swaggerDefinition,
    apis: [
      path.join(srcRoot, 'auth', 'auth.routes.js'),
      path.join(srcRoot, 'notes', 'note.routes.js'),
      path.join(srcRoot, 'docs', 'schemas.js'),
    ],
  };

  return swaggerJSDoc(options);
}
