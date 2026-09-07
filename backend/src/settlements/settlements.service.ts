import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingEventType, Prisma } from '@prisma/client';
import { enqueueAccountingEvent } from '../accounting/accounting-events';
import { resolveAgentId } from '../common/agent-scope';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { requireOrgId, tenantScope } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateSettlementDto, QuerySettlementDto } from './dto';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generate(user: AuthUser, dto: GenerateSettlementDto) {
    const orgId = requireOrgId(user);
    const from = new Date(`${dto.from}T00:00:00.000Z`);
    const to = new Date(`${dto.to}T23:59:59.999Z`);
    if (from > to) throw new BadRequestException('بداية الفترة بعد نهايتها');

    const settlement = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:settlement:${dto.agentId}`}))`;
      const agent = await tx.agent.findFirst({
        where: { id: dto.agentId, ...tenantScope(user) },
      });
      if (!agent) throw new NotFoundException('الوكيل غير موجود');

      const overlapping = await tx.settlement.findFirst({
        where: {
          organizationId: orgId,
          agentId: dto.agentId,
          fromDate: { lte: to },
          toDate: { gte: from },
        },
      });
      const exactPeriod =
        overlapping?.fromDate.getTime() === from.getTime() &&
        overlapping.toDate.getTime() === to.getTime();
      if (overlapping && (!exactPeriod || overlapping.status === 'SETTLED')) {
        throw new ConflictException(
          overlapping.status === 'SETTLED'
            ? 'لا يمكن إعادة إنشاء تسوية نهائية'
            : 'توجد تسوية متداخلة لنفس الوكيل',
        );
      }

      const commissions = await tx.commission.findMany({
        where: {
          organizationId: orgId,
          agentId: dto.agentId,
          reversedAt: null,
          createdAt: { gte: from, lte: to },
          settlementLine: overlapping
            ? { is: { settlementId: overlapping.id } }
            : { is: null },
        },
        include: { ticket: true },
      });
      const sales = commissions.reduce(
        (sum, commission) => sum.plus(commission.ticket.fare),
        new Prisma.Decimal(0),
      );
      const commissionTotal = commissions.reduce(
        (sum, commission) => sum.plus(commission.amount),
        new Prisma.Decimal(0),
      );
      const data = {
        salesAmount: sales,
        commissionAmount: commissionTotal,
        netAmount: sales.minus(commissionTotal),
      };

      const settlement = overlapping
        ? await tx.settlement.update({
            where: { id: overlapping.id },
            data,
            include: { agent: true },
          })
        : await tx.settlement.create({
            data: {
              organizationId: orgId,
              agentId: dto.agentId,
              fromDate: from,
              toDate: to,
              ...data,
            },
            include: { agent: true },
          });
      if (overlapping) {
        await tx.settlementLine.deleteMany({
          where: { settlementId: settlement.id },
        });
      }
      if (commissions.length > 0) {
        await tx.settlementLine.createMany({
          data: commissions.map((commission) => ({
            organizationId: orgId,
            settlementId: settlement.id,
            commissionId: commission.id,
            amount: commission.amount,
          })),
        });
      }
      return settlement;
    });

    await this.audit.log(
      user,
      'SETTLEMENT_GENERATED',
      'Settlement',
      settlement.id,
      { agentId: dto.agentId, net: settlement.netAmount.toFixed(2) },
    );
    return settlement;
  }

  async findAll(user: AuthUser, query: QuerySettlementDto) {
    const agentId = await resolveAgentId(this.prisma, user);
    const where: Prisma.SettlementWhereInput = {
      organizationId: requireOrgId(user),
      ...(user.branchId ? { agent: { branchId: user.branchId } } : {}),
      ...(agentId ? { agentId } : {}),
    };
    if (!agentId && query.agentId) where.agentId = query.agentId;
    if (query.status) where.status = query.status;
    return this.prisma.settlement.findMany({
      where,
      include: { agent: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const agentId = await resolveAgentId(this.prisma, user);
    const settlement = await this.prisma.settlement.findFirst({
      where: {
        id,
        organizationId: requireOrgId(user),
        ...(agentId ? { agentId } : {}),
        ...(user.branchId ? { agent: { branchId: user.branchId } } : {}),
      },
      include: { agent: true },
    });
    if (!settlement) throw new NotFoundException('التسوية غير موجودة');
    return settlement;
  }

  async settle(user: AuthUser, id: string) {
    const orgId = requireOrgId(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:settlement-record:${id}`}))`;
      const settlement = await tx.settlement.findFirst({
        where: {
          id,
          organizationId: orgId,
          ...(user.branchId ? { agent: { branchId: user.branchId } } : {}),
        },
      });
      if (!settlement) throw new NotFoundException('التسوية غير موجودة');
      if (settlement.status === 'SETTLED') {
        throw new ConflictException('تم إنهاء التسوية مسبقاً');
      }

      const finalized = await tx.settlement.update({
        where: { id },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          settledById: user.sub,
        },
        include: { agent: true },
      });
      await enqueueAccountingEvent(
        tx,
        orgId,
        AccountingEventType.AGENT_SETTLEMENT,
        finalized.id,
      );
      return finalized;
    });
    await this.audit.log(user, 'SETTLEMENT_SETTLED', 'Settlement', id);
    return updated;
  }
}
