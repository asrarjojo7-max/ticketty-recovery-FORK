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
      const claims = await this.jwt.verifyAsync<Pick<AuthUser, 'sub'>>(token);
      if (!claims.sub) throw new Error('Token subject is missing');

      const user = await this.prisma.findAuthUserById(claims.sub);

      if (!user || !user.active || !user.organizationActive) {
        throw new Error('User or organization is inactive');
      }

      request.user = {
        sub: user.id,
        orgId: user.organizationId,
        branchId: user.branchId,
        name: user.name,
        email: user.email,
        roleKey: user.roleKey,
        permissions: user.permissions,
      } satisfies AuthUser;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
