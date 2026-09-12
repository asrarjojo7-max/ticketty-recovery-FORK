import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { tenantScope } from '../common/org';
import { lockTripTransaction } from '../common/transaction-locks';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateManifestDto } from './dto';

@Injectable()
export class ManifestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generate(user: AuthUser, dto: GenerateManifestDto) {
    const orgId = this.org(user);
    await this.tripExists(user, dto.tripId);

    const existing = await this.prisma.manifest.findUnique({
      where: { tripId: dto.tripId },
    });

    const manifest = existing
      ? await this.prisma.manifest.update({
          where: { id: existing.id },
          data: {
            generatedById: user.sub,
            generatedAt: new Date(),
            version: { increment: 1 },
          },
        })
      : await this.prisma.manifest.create({
          data: {
            organizationId: orgId,
            tripId: dto.tripId,
            generatedById: user.sub,
          },
        });

    await this.audit.log(user, 'MANIFEST_GENERATED', 'Manifest', manifest.id, {
      tripId: dto.tripId,
    });
    return this.assemble(orgId, dto.tripId);
  }

  async findByTrip(user: AuthUser, tripId: string) {
    const orgId = this.org(user);
    await this.tripExists(user, tripId);
    return this.assemble(orgId, tripId);
  }

  async findOne(user: AuthUser, id: string) {
    const orgId = this.org(user);
    const manifest = await this.prisma.manifest.findFirst({
      where: {
        id,
        organizationId: orgId,
        ...(user.branchId ? { trip: { branchId: user.branchId } } : {}),
      },
    });
    if (!manifest) throw new NotFoundException('المنفستو غير موجود');
    return this.assemble(orgId, manifest.tripId);
  }

  async lock(user: AuthUser, id: string) {
    const orgId = this.org(user);
    const manifest = await this.prisma.manifest.findFirst({
      where: {
        id,
        organizationId: orgId,
        ...(user.branchId ? { trip: { branchId: user.branchId } } : {}),
      },
    });
    if (!manifest) throw new NotFoundException('المنفستو غير موجود');

    const lockedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, orgId, manifest.tripId);
      const current = await tx.manifest.findFirst({
        where: {
          id,
          organizationId: orgId,
          ...(user.branchId ? { trip: { branchId: user.branchId } } : {}),
        },
        include: { trip: { select: { status: true } } },
      });
      if (!current) throw new NotFoundException('المنفستو غير موجود');
      if (current.lockedAt) {
        throw new ConflictException('تم قفل المنفستو مسبقاً');
      }
      if (
        current.trip.status === 'CANCELLED' ||
        current.trip.status === 'COMPLETED' ||
        current.trip.status === 'DEPARTED'
      ) {
        throw new ConflictException('لا يمكن قفل منفستو رحلة منتهية');
      }

      const locked = await tx.manifest.update({
        where: { id },
        data: { lockedAt },
      });
      await tx.trip.update({
        where: { id: manifest.tripId },
        data: { manifestLockedAt: lockedAt, status: 'DEPARTED' },
      });
      return locked;
    });
    await this.audit.log(user, 'MANIFEST_LOCKED', 'Manifest', id, {
      tripId: manifest.tripId,
    });
    return updated;
  }

  private async assemble(orgId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, organizationId: orgId },
      include: { route: true, bus: { include: { seatTemplate: true } } },
    });
    const manifest = await this.prisma.manifest.findUnique({
      where: { tripId },
    });
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tripId,
        organizationId: orgId,
        status: { in: ['BOOKED', 'CHECKED_IN'] },
      },
      include: { booking: { include: { agent: true } } },
      orderBy: [{ seatLabel: 'asc' }],
    });
    // أرقام المقاعد نصية في القاعدة (أرقام فقط بعد الترقيم الجديد،
    // وحروف قديمة للتذاكر التاريخية) — نرتب رقميًا في الذاكرة حتى
    // يظهر "9" قبل "10" في المنفستو، مع تراجع آمن للترتيب الأبجدي
    // لأي تذاكر حروف لم تُرحّل بعد.
    const numericOr = (a: string, b: string) =>
      a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
    tickets.sort((a, b) => numericOr(a.seatLabel, b.seatLabel));

    const revenue = tickets.reduce((sum, t) => sum + t.fare.toNumber(), 0);
    return {
      manifest,
      trip,
      tickets,
      totals: { passengers: tickets.length, revenue },
    };
  }

  private async tripExists(user: AuthUser, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, ...tenantScope(user) },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');
    return trip;
  }

  private org(user: AuthUser): string {
    if (!user.orgId)
      throw new NotFoundException('لا توجد مؤسسة مرتبطة بالمستخدم');
    return user.orgId;
  }
}
