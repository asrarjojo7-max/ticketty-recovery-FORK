import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTelegramLinkToken,
  digestTelegramLinkToken,
} from './telegram-link-token';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const INTERNAL_TIMESTAMP_TOLERANCE_SECONDS = 60;

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createChallenge(user: AuthUser) {
    if (!user.orgId) throw new UnauthorizedException('حساب المنصة لا يمكن ربطه بهذه الطريقة');

    const token = createTelegramLinkToken();
    const pendingIdentity = 'pending:' + token.digest.toString('hex');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await this.prisma.createTelegramLinkChallenge({
      id: randomUUID(),
      userId: user.sub,
      tokenDigest: token.digest,
      telegramUserId: pendingIdentity,
      telegramChatId: pendingIdentity,
      expiresAt,
    });

    await this.prisma.withTenantContext(user.orgId, () =>
      this.audit.log(
        user,
        'TELEGRAM_LINK_CHALLENGE_CREATED',
        'TelegramAccountLink',
        user.sub,
        { expiresAt: expiresAt.toISOString() },
      ),
    );

    return {
      token: token.token,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
    };
  }

  async attachTelegramIdentity(
    token: string,
    telegramUserId: string,
    telegramChatId: string,
  ) {
    this.assertTelegramId(telegramUserId);
    this.assertTelegramId(telegramChatId);
    const digest = digestTelegramLinkToken(token);
    try {
      return await this.prisma.attachTelegramLinkChallenge({
        tokenDigest: digest,
        telegramUserId,
        telegramChatId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.includes('Telegram account is already linked') ||
        message.includes('Telegram link challenge is invalid')
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  async confirm(user: AuthUser, token: string) {
    if (!user.orgId) throw new UnauthorizedException('حساب المنصة غير مدعوم');
    const digest = digestTelegramLinkToken(token);
    try {
      const link = await this.prisma.confirmTelegramLink(digest, user.sub);
      await this.prisma.withTenantContext(user.orgId, () =>
        this.audit.log(
          user,
          'TELEGRAM_LINK_CONFIRMED',
          'TelegramAccountLink',
          user.sub,
          { telegramUserId: link.telegramUserId },
        ),
      );
      return {
        linked: true,
        telegramUserId: link.telegramUserId,
        telegramChatId: link.telegramChatId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.includes('already linked') ||
        message.includes('expired') ||
        message.includes('consumed') ||
        message.includes('not found')
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  async revoke(user: AuthUser) {
    if (!user.orgId) throw new UnauthorizedException('حساب المنصة غير مدعوم');
    const changed = await this.prisma.revokeTelegramLink(user.sub);
    await this.prisma.withTenantContext(user.orgId, () =>
      this.audit.log(
        user,
        'TELEGRAM_LINK_REVOKED',
        'TelegramAccountLink',
        user.sub,
      ),
    );
    return { revoked: changed };
  }

  async current(user: AuthUser) {
    if (!user.orgId) throw new UnauthorizedException('حساب المنصة غير مدعوم');
    return this.prisma.findTelegramLinkForUser(user.sub);
  }

  async verifyInternalSignature(
    timestamp: string,
    signature: string,
    canonical: string,
  ) {
    const ts = Number(timestamp);
    if (!Number.isInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > INTERNAL_TIMESTAMP_TOLERANCE_SECONDS) {
      throw new BadRequestException('طلب Telegram الداخلي منتهي الصلاحية');
    }
    if (!/^v1=[a-f0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('توقيع Telegram الداخلي غير صالح');
    }
    const secretPath = process.env.TELEGRAM_LINK_HMAC_FILE?.trim();
    if (!secretPath) throw new UnauthorizedException('تكامل Telegram الداخلي غير مهيأ');
    const secret = (await readFile(secretPath, 'utf8')).trim();
    if (!secret) throw new UnauthorizedException('سر تكامل Telegram الداخلي فارغ');
    const expected = createHmac('sha256', secret).update(canonical).digest('hex');
    const provided = signature.slice(3);
    if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))) {
      throw new UnauthorizedException('توقيع Telegram الداخلي غير صالح');
    }
  }

  private assertTelegramId(value: string) {
    if (!/^-?[0-9]{1,32}$/.test(value)) {
      throw new BadRequestException('معرّف Telegram غير صالح');
    }
  }
}
