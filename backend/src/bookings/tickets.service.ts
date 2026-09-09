import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveAgentId } from '../common/agent-scope';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { tenantScope } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import { QueryTicketDto } from './dto';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthUser, query: QueryTicketDto = {}) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const where: Prisma.TicketWhereInput = {
      organizationId: scope.organizationId,
      ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
      ...(agentId ? { booking: { agentId } } : {}),
    };
    if (query.tripId) where.tripId = query.tripId;
    return this.prisma.ticket.findMany({
      where,
      include: {
        booking: { include: { payments: true } },
        trip: { include: { route: true, bus: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: { include: { payments: true, customer: true } },
        trip: { include: { route: true, bus: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    return ticket;
  }

  async findByQr(user: AuthUser, qr: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    // بوابة الصعود (Go-Live UX-1): القيمة قد تكون رمز QR (uuid) أو رقم
    // التذكرة المطبوع TKT-… — الكاشير يقرأ الرقم من الورقة. نطابق
    // أياً منهما داخل نفس النطاق المعزول (لا بحث عابر للمستأجرين).
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [{ qrCode: qr }, { number: qr }],
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: true,
        trip: { include: { route: true, bus: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    return ticket;
  }

  async checkIn(user: AuthUser, id: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        trip: { select: { status: true, departureAt: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    // بوابة الصعود مسؤولة عن عدّ الركاب الفعلي — لا يُسمح بصعود بعد
    // مغادرة الرحلة أو إلغائها أو اكتمالها (سلامة المنفستو والأشغال).
    const unboardable = ['DEPARTED', 'COMPLETED', 'CANCELLED'];
    if (unboardable.includes(ticket.trip.status)) {
      throw new ConflictException('لا يمكن تسجيل الصعود لهذه الرحلة الآن');
    }

    // كتابة شرطية ذرّية: التذكرة يجب أن تكون BOOKED في لحظة التحديث.
    // قراءة-ثم-كتابة تسمح بسباق تسجيل صعود متزامن مزدوج (تدقيق P1-1) —
    // الشرط في WHERE يجعل التحديث فاشلاً ذرّياً عند أي سباق.
    const claimed = await this.prisma.$transaction((tx) =>
      tx.ticket.updateMany({
        where: {
          id,
          status: 'BOOKED',
          ...(agentId ? { booking: { agentId } } : {}),
        },
        data: { status: 'CHECKED_IN' },
      }),
    );
    if (claimed.count === 0) {
      throw new ConflictException('تم تسجيل صعود صاحب هذه التذكرة مسبقاً');
    }

    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { booking: true, trip: true },
    });
    await this.audit.log(user, 'TICKET_CHECKED_IN', 'Ticket', id, {
      tripId: ticket.tripId,
    });
    return updated;
  }
}
