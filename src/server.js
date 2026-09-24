import { MongoClient } from 'mongodb';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

// Process entry point: loads config, connects to MongoDB, starts
// listening, and shuts down cleanly on SIGINT/SIGTERM. Not unit tested
// directly — createApp() (exercised by the full test suite) holds all
// the testable logic; this file only wires it to a real process and a
// real MongoDB connection.

const config = loadConfig();
const client = new MongoClient(config.mongoUri);
await client.connect();

const app = await createApp({ db: client.db(), config });
const server = app.listen(config.port, () => {
  console.log(`notes-service listening on port ${config.port}`);
});

/**
 * Closes the HTTP server and the MongoDB connection before exiting, so
 * in-flight requests and connections aren't dropped abruptly.
 * @param {string} signal - the signal that triggered shutdown, for logging
 */
async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await client.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
