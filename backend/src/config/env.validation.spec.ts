import { validateEnvironment } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://ticketty:ticketty@localhost:5432/ticketty',
  JWT_SECRET: 'a-secure-test-secret-that-is-longer-than-32-characters',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('validateEnvironment', () => {
  it('normalizes defaults and numeric port', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3001,
      API_BIND_HOST: '0.0.0.0',
      TRUST_PROXY_HOPS: 0,
      JWT_EXPIRES_IN: '15m',
      JWT_ISSUER: 'ticketty-api',
      JWT_AUDIENCE: 'ticketty-web',
      WEB_ORIGIN: 'http://localhost:3000',
      PILOT_PAYMENT_MODE: 'CASH',
    });
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: undefined }),
    ).toThrow('DATABASE_URL is required');
  });

  it('rejects short and placeholder JWT secrets', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'too-short' }),
    ).toThrow('JWT_SECRET');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'replace-with-a-long-random-secret-at-least-32-characters',
      }),
    ).toThrow('JWT_SECRET');
  });

  it('rejects insecure production origins and overlong production sessions', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://ticketty.example.com',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://ticketty.example.com',
        JWT_EXPIRES_IN: '7d',
      }),
    ).toThrow('JWT_EXPIRES_IN');
    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'https://ticketty.example.com',
        JWT_EXPIRES_IN: '15m',
      }),
    ).toMatchObject({ JWT_EXPIRES_IN: '15m' });
  });

  it('rejects any non-cash pilot payment mode', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, PILOT_PAYMENT_MODE: 'CARD' }),
    ).toThrow('PILOT_PAYMENT_MODE must be CASH');
  });

  it('rejects invalid origins and ports', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, WEB_ORIGIN: 'file:///tmp' }),
    ).toThrow('WEB_ORIGIN');
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrow('PORT');
    expect(() =>
      validateEnvironment({ ...validEnvironment, TRUST_PROXY_HOPS: '-1' }),
    ).toThrow('TRUST_PROXY_HOPS');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        API_BIND_HOST: 'public-host',
      }),
    ).toThrow('API_BIND_HOST');
  });
});
