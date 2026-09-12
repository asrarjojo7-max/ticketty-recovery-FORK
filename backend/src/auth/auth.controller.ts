import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowPendingPasswordChange } from '../common/decorators/allow-pending-password-change.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { AuditService } from '../common/audit/audit.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @AllowPendingPasswordChange()
  @SubscriptionPolicy({
    mode: 'exempt',
    reason: 'Session inspection is required to route temporary-password users',
  })
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  /**
   * تدقيق P1-3: تغيير كلمة المرور — يبطل كل الجلسات الأقدم (طابع زمني
   * يقارنه JwtAuthGuard بـ iat كل توكِن).
   */
  @AllowPendingPasswordChange()
  @SubscriptionPolicy({
    mode: 'exempt',
    reason: 'Password remediation must remain available for every tenant',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ changedAt: string }> {
    return this.authService
      .changePassword(user, dto.currentPassword, dto.newPassword)
      .then(async (result) => {
        // سجل التدقيق (نفس قناة النظام) — لا محتوى حساس أبداً
        await this.audit.log(user, 'AUTH_PASSWORD_CHANGED', 'User', user.sub, {
          changedAt: result.changedAt,
        });
        return result;
      });
  }
}
