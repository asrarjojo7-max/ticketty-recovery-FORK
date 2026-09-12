import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Narrow exemption for endpoints required to inspect or remediate a temporary
 * password. Never apply this to business or administration endpoints.
 */
export const AllowPendingPasswordChange = (): MethodDecorator &
  ClassDecorator => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
