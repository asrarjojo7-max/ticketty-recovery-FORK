import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.findAuthUserByEmail(normalizedEmail);

    if (!user || !user.active || !user.organizationActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.prisma.recordFailedLogin(user.id);
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    await this.prisma.recordSuccessfulLogin(user.id);

    const payload = {
      sub: user.id,
      orgId: user.organizationId,
      branchId: user.branchId,
      name: user.name,
      email: user.email,
      roleKey: user.roleKey,
      permissions: user.permissions,
    };

    const access_token = await this.jwt.signAsync(payload);

    await this.prisma.withTenantContext(user.organizationId, () =>
      this.prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'AUTH_LOGIN_SUCCEEDED',
          entity: 'User',
          entityId: user.id,
        },
      }),
    );

    return {
      access_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleKey: user.roleKey,
        orgId: user.organizationId,
        branchId: user.branchId,
        permissions: user.permissions,
      },
    };
  }
}
