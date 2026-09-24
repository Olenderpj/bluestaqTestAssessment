import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { TokenService } from '../../src/auth/token.service.js';
import { UnauthorizedError } from '../../src/common/errors.js';

const tokens = new TokenService({ secret: 'secret-a', expiresIn: '1h' });
const user = { id: '507f1f77bcf86cd799439011', username: 'alice' };

test('issue + verify round-trips the identity', () => {
  const token = tokens.issue(user);

  assert.deepEqual(tokens.verify(token), { userId: user.id, username: 'alice' });

  const decoded = jwt.decode(token);
  assert.equal(decoded.sub, user.id);
  assert.equal(decoded.username, 'alice');
  assert.ok(decoded.exp > decoded.iat);
});

test('verify rejects a token signed with another secret', () => {
  const other = new TokenService({ secret: 'secret-b', expiresIn: '1h' }).issue(user);

  assert.throws(() => tokens.verify(other), UnauthorizedError);
});

test('verify rejects an expired token', () => {
  const expired = jwt.sign(
    { username: 'alice', exp: Math.floor(Date.now() / 1000) - 60 },
    'secret-a',
    { subject: user.id },
  );

  assert.throws(() => tokens.verify(expired), UnauthorizedError);
});

test('verify rejects an unsigned (alg=none) token', () => {
  const unsigned = jwt.sign({ username: 'alice' }, null, { algorithm: 'none', subject: user.id });

  assert.throws(() => tokens.verify(unsigned), UnauthorizedError);
});

test('verify rejects a token missing the username claim', () => {
  const noUsername = jwt.sign({}, 'secret-a', { subject: user.id });

  assert.throws(() => tokens.verify(noUsername), UnauthorizedError);
});

test('verify rejects garbage', () => {
  assert.throws(() => tokens.verify('not-a-jwt'), UnauthorizedError);
});
