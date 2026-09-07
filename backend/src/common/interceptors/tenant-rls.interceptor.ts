import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.user?.orgId;
    if (!organizationId) {
      throw new UnauthorizedException('Tenant database context is required');
    }

    return new Observable((subscriber) => {
      void this.prisma
        .withTenantContext(organizationId, () => lastValueFrom(next.handle()))
        .then((value) => {
          subscriber.next(value);
          subscriber.complete();
        })
        .catch((error: unknown) => subscriber.error(error));
    });
  }
}
