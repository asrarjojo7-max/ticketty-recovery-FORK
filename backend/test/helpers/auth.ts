import request from 'supertest';
import type { App } from 'supertest/types';

interface LoginBody {
  access_token?: string;
  user?: { mustChangePassword?: boolean };
}

/**
 * Complete the real first-login credential lifecycle for E2E fixtures.
 * Returns a token bound to the permanent credential version.
 */
export async function loginAndRotateTemporaryPassword(
  server: App,
  email: string,
  temporaryPassword: string,
  permanentPassword: string,
): Promise<string> {
  const initial = await request(server)
    .post('/api/auth/login')
    .send({ email, password: temporaryPassword });
  if (![200, 201].includes(initial.status)) {
    throw new Error(`initial login ${email} failed with ${initial.status}`);
  }
  const initialBody = initial.body as LoginBody;
  if (!initialBody.access_token)
    throw new Error(`initial login ${email} returned no token`);

  if (initialBody.user?.mustChangePassword !== true) {
    return initialBody.access_token;
  }

  const changed = await request(server)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${initialBody.access_token}`)
    .send({
      currentPassword: temporaryPassword,
      newPassword: permanentPassword,
    });
  if (changed.status !== 200) {
    throw new Error(`password rotation ${email} failed with ${changed.status}`);
  }

  const permanent = await request(server)
    .post('/api/auth/login')
    .send({ email, password: permanentPassword });
  if (![200, 201].includes(permanent.status)) {
    throw new Error(`permanent login ${email} failed with ${permanent.status}`);
  }
  const permanentBody = permanent.body as LoginBody;
  if (!permanentBody.access_token || permanentBody.user?.mustChangePassword) {
    throw new Error(
      `permanent login ${email} did not clear password-change state`,
    );
  }
  return permanentBody.access_token;
}
