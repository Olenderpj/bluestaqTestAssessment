/**
 * Reads and validates the service's runtime configuration from
 * environment variables, applying defaults for everything optional.
 * @param {NodeJS.ProcessEnv} [env] - defaults to `process.env`; tests pass a plain object instead
 * @returns {{ port: number, mongoUri: string, jwtSecret: string, jwtExpiresIn: string, bcryptRounds: number }}
 * @throws {Error} if `JWT_SECRET` is not set — the service must never start with a default secret
 */
export function loadConfig(env = process.env) {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return {
    port: Number(env.PORT ?? 3000),
    mongoUri: env.MONGO_URI ?? 'mongodb://localhost:27017/notes',
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1h',
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
  };
}
