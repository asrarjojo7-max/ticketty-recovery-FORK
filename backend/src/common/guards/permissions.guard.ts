import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthenticatedRequest,
  AuthUser,
} from '../decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * صلاحيات نطاق المنصة (Go-Live S-1): حكرية لمشغّل المنصة صراحةً —
 * نجمة الـ Tenant ('*') لا تفتحها أبدًا. النجمة تعني "كل شيء داخل
 * منظمتي" وليس "كل شيء في النظام". (نفس الدلالات المطبقة في الويب
 * web/src/lib/permissions.ts — الآن الطبقتان متطابقتان من الأصل.)
 *
 * هذا لا يغيّر أي حماية قائمة (بوابة المنصة كانت محمية بطبقة
 * requirePlatformOperator الداخلية — مثبتة حيًا في الـ audit) —
 * بل يحوّل الحاجز من "داخل كل دالة" إلى "الحارس نفسه + الداخل"،
 * فأي مسار منصة مستقبلي ينسى الفحص الداخلي يظل محصّنًا.
 */
const PLATFORM_SCOPED_PERMISSIONS = new Set(['platform.admin']);

function hasPermission(perms: string[], required: string): boolean {
  if (PLATFORM_SCOPED_PERMISSIONS.has(required)) {
    return perms.includes(required);
  }
  if (perms.includes('*') || perms.includes(required)) return true;
  const [domain] = required.split('.');
  return perms.includes(`${domain}.*`);
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user: AuthUser | undefined = request.user;
    if (!user) return false;

    const perms = user.permissions ?? [];
    const allowed = required.some((r) => hasPermission(perms, r));
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
