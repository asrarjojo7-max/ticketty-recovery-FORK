import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

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

  /**
   * تدقيق P1-3: مسار تغيير كلمة المرور — التحقق من الكلمة الحالية bcrypt
   * ثم تحديث طابع passwordChangedAt داخل سياق المنظمة (صف المستخدم
   * نفسه مرئي لمنظمته عبر RLS، بنفس نمط كل تحديثات المستخدمين في
   * النظام). الطابع الزمني يُبطل كل الجلسات الأقدم عبر JwtAuthGuard
   * (passwordChangedAt مقابل iat). سجل التدقيق عبر AuditService.
   */
  async changePassword(
    user: Pick<AuthUser, 'sub' | 'orgId'>,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ changedAt: string }> {
    // قراءة الهاش الحالي: التحديث داخل معاملة ذرّية بشرط الهاش القديم
    // يمنع سباق تغييرين متزامنين (كلاهما يعرف الكلمة القديمة).
    const rows = await this.prisma.$queryRaw<
      Array<{
        passwordHash: string;
        active: boolean;
        organizationId: string | null;
      }>
    >`SELECT "passwordHash", "active", "organizationId" FROM "users" WHERE "id" = ${user.sub}`;
    const record = rows[0];
    if (!record || !record.active || record.organizationId !== user.orgId) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    const valid = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }
    const same = await bcrypt.compare(newPassword, record.passwordHash);
    if (same) {
      throw new BadRequestException(
        'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
      );
    }
    const newHash = await bcrypt.hash(newPassword, 12);

    // تحديث شرطي ذرّي: الهاش القديم في WHERE يرفض السباقات المتزامنة
    // وضمان عدم تفويت فحص كلمة المرور الحالية.
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.sub, passwordHash: record.passwordHash },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException(
        'تغيرت كلمة المرور مؤخراً من جلسة أخرى — سجّل الدخول مجدداً',
      );
    }

    return { changedAt: new Date().toISOString() };
  }
}
