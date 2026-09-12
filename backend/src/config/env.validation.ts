const NODE_ENV_VALUES = new Set(['development', 'test', 'production']);
const PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-long-random-secret-at-least-32-characters',
  'change-me',
  'secret',
]);

export type ValidatedEnvironment = Record<string, unknown> & {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  PORT: number;
  API_BIND_HOST: string;
  TRUST_PROXY_HOPS: number;
  WEB_ORIGIN: string;
  PILOT_PAYMENT_MODE: 'CASH';
};

function requiredString(
  environment: Record<string, unknown>,
  key: string,
  fallback?: string,
): string {
  const value = environment[key] ?? fallback;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function jwtLifetimeSeconds(value: string): number | null {
  const match = /^(\d+)(s|m|h)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1;
  return amount * multiplier;
}

function httpUrl(value: string, key: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${key} must use http or https`);
  }
  return url.origin;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ValidatedEnvironment {
  const nodeEnv = requiredString(environment, 'NODE_ENV', 'development');
  if (!NODE_ENV_VALUES.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  const databaseUrl = requiredString(environment, 'DATABASE_URL');
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgresql:', 'postgres:'].includes(database.protocol)) {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }

  const jwtSecret = requiredString(environment, 'JWT_SECRET');
  if (
    jwtSecret.length < 32 ||
    PLACEHOLDER_SECRETS.has(jwtSecret) ||
    jwtSecret.startsWith('replace-with-')
  ) {
    throw new Error(
      'JWT_SECRET must be a non-placeholder value of at least 32 characters',
    );
  }

  const portValue = requiredString(environment, 'PORT', '3001');
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const apiBindHost = requiredString(
    environment,
    'API_BIND_HOST',
    nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0',
  );
  if (!['127.0.0.1', '0.0.0.0'].includes(apiBindHost)) {
    throw new Error('API_BIND_HOST must be 127.0.0.1 or 0.0.0.0');
  }

  const trustProxyValue = requiredString(environment, 'TRUST_PROXY_HOPS', '0');
  const trustProxyHops = Number(trustProxyValue);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer');
  }

  const jwtExpiresIn = requiredString(environment, 'JWT_EXPIRES_IN', '15m');
  const jwtSeconds = jwtLifetimeSeconds(jwtExpiresIn);
  if (nodeEnv === 'production' && (!jwtSeconds || jwtSeconds > 3600)) {
    throw new Error(
      'JWT_EXPIRES_IN must be an s/m/h duration no longer than 1h in production',
    );
  }
  const webOrigin = httpUrl(
    requiredString(environment, 'WEB_ORIGIN', 'http://localhost:3000'),
    'WEB_ORIGIN',
  );
  const pilotPaymentMode = requiredString(
    environment,
    'PILOT_PAYMENT_MODE',
    'CASH',
  );
  if (pilotPaymentMode !== 'CASH') {
    throw new Error('PILOT_PAYMENT_MODE must be CASH for the controlled pilot');
  }
  if (nodeEnv === 'production' && new URL(webOrigin).protocol !== 'https:') {
    throw new Error('WEB_ORIGIN must use HTTPS in production');
  }

  return {
    ...environment,
    NODE_ENV: nodeEnv as ValidatedEnvironment['NODE_ENV'],
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    JWT_ISSUER: requiredString(environment, 'JWT_ISSUER', 'ticketty-api'),
    JWT_AUDIENCE: requiredString(environment, 'JWT_AUDIENCE', 'ticketty-web'),
    PORT: port,
    API_BIND_HOST: apiBindHost,
    TRUST_PROXY_HOPS: trustProxyHops,
    WEB_ORIGIN: webOrigin,
    PILOT_PAYMENT_MODE: 'CASH',
  };
}
