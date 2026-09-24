import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

// loadConfig() reads process.env by default; every test here passes an
// explicit env object so tests never depend on (or pollute) real env vars.

test('loadConfig throws when JWT_SECRET is missing', () => {
  assert.throws(() => loadConfig({}), /JWT_SECRET/);
});

test('loadConfig applies defaults', () => {
  const config = loadConfig({ JWT_SECRET: 's3cret' });

  assert.deepEqual(config, {
    port: 3000,
    mongoUri: 'mongodb://localhost:27017/notes',
    jwtSecret: 's3cret',
    jwtExpiresIn: '1h',
    bcryptRounds: 12,
  });
});

test('loadConfig reads overrides from env', () => {
  const config = loadConfig({
    JWT_SECRET: 'x',
    PORT: '8080',
    MONGO_URI: 'mongodb://db/n',
    JWT_EXPIRES_IN: '15m',
    BCRYPT_ROUNDS: '10',
  });

  assert.equal(config.port, 8080);
  assert.equal(config.mongoUri, 'mongodb://db/n');
  assert.equal(config.jwtExpiresIn, '15m');
  assert.equal(config.bcryptRounds, 10);
});
