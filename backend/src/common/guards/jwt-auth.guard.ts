import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AuthenticatedRequest,
  AuthUser,
} from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header: string | undefined = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const token = header.slice(7);
      const claims = await this.jwt.verifyAsync<
        Pick<AuthUser, 'sub'> & { iat?: number }
      >(token);
      if (!claims.sub) throw new Error('Token subject is missing');

      const user = await this.prisma.findAuthUserById(claims.sub);

      if (!user || !user.active || !user.organizationActive) {
        throw new Error('User or organization is inactive');
      }

      // تدقيق P1-3: تغيير كلمة المرور يُبطل كل الجلسات الصادرة قبله —
      // طابع زمني من قاعدة البيانات يُقارن بـ iat التوكِن (ثواني).
      if (claims.iat !== undefined) {
        const changedAtSeconds = Math.floor(
          user.passwordChangedAt.getTime() / 1000,
        );
        if (claims.iat < changedAtSeconds) {
          throw new Error('Token predates the current password');
        }
      }

      request.user = {
        sub: user.id,
        orgId: user.organizationId,
        branchId: user.branchId,
        name: user.name,
        email: user.email,
        roleKey: user.roleKey,
        permissions: user.permissions,
        // اشتراك المنظمة من نفس قراءة DB هذه (auth_user_by_id v3) —
        // مصدر سلطة SubscriptionGuard؛ لا قراءة إضافية ولا token.
        subscriptionStatus: user.subscriptionStatus ?? null,
        subscriptionPeriodEnd: user.subscriptionPeriodEnd ?? null,
      } satisfies AuthUser;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
