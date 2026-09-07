import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingEventType, Prisma } from '@prisma/client';
import { enqueueAccountingEvent } from '../accounting/accounting-events';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { requireOrgId, tenantScope } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateExpenseAdjustmentDto,
  CreateExpenseDto,
  QueryExpenseDto,
  UpdateExpenseDto,
} from './dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateExpenseDto) {
    const orgId = requireOrgId(user);
    const { amount, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      await this.validateReferences(tx, user, dto.tripId, dto.busId);
      return tx.expense.create({
        data: {
          ...data,
          organizationId: orgId,
          branchId: user.branchId,
          createdById: user.sub,
          amount: new Prisma.Decimal(amount),
        },
        include: { trip: { include: { route: true } }, bus: true },
      });
    });
  }

  findAll(user: AuthUser, query: QueryExpenseDto) {
    const { date, category } = query;
    const where: Prisma.ExpenseWhereInput = { ...tenantScope(user) };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.createdAt = { gte: start, lt: end };
    }
    if (category) where.category = category;
    if (query.status) where.status = query.status;
    return this.prisma.expense.findMany({
      where,
      include: {
        trip: { include: { route: true } },
        bus: true,
        adjustments: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, ...tenantScope(user) },
      include: {
        trip: { include: { route: true } },
        bus: true,
        adjustments: true,
      },
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    return expense;
  }

  async update(user: AuthUser, id: string, dto: UpdateExpenseDto) {
    const { amount, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!expense) throw new NotFoundException('المصروف غير موجود');
      if (expense.status !== 'DRAFT') {
        throw new ConflictException(
          'لا يمكن تعديل مصروف معتمد؛ أنشئ قيد تسوية بدلاً من ذلك',
        );
      }
      await this.validateReferences(
        tx,
        user,
        dto.tripId ?? expense.tripId ?? undefined,
        dto.busId ?? expense.busId ?? undefined,
      );
      return tx.expense.update({
        where: { id },
        data: {
          ...data,
          ...(amount !== undefined
            ? { amount: new Prisma.Decimal(amount) }
            : {}),
        },
        include: { trip: { include: { route: true } }, bus: true },
      });
    });
  }

  async remove(user: AuthUser, id: string) {
    const expense = await this.ensureExists(user, id);
    if (expense.status !== 'DRAFT') {
      throw new ConflictException('لا يمكن حذف مصروف معتمد');
    }
    return this.prisma.expense.delete({ where: { id } });
  }

  async approve(user: AuthUser, id: string) {
    const orgId = user.orgId;
    if (!orgId) throw new NotFoundException('لا توجد مؤسسة مرتبطة بالمستخدم');
    const expense = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!existing) throw new NotFoundException('المصروف غير موجود');
      if (existing.status !== 'DRAFT')
        throw new ConflictException('تم اعتماد المصروف مسبقاً');
      const approved = await tx.expense.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: user.sub,
        },
        include: { adjustments: true, trip: true, bus: true },
      });
      await enqueueAccountingEvent(
        tx,
        orgId,
        AccountingEventType.EXPENSE_APPROVED,
        approved.id,
      );
      return approved;
    });
    await this.audit.log(user, 'EXPENSE_APPROVED', 'Expense', id, {
      amount: expense.amount.toFixed(2),
    });
    return expense;
  }

  async adjust(user: AuthUser, id: string, dto: CreateExpenseAdjustmentDto) {
    const orgId = user.orgId;
    if (!orgId) throw new NotFoundException('لا توجد مؤسسة مرتبطة بالمستخدم');
    const result = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!expense) throw new NotFoundException('المصروف غير موجود');
      if (expense.status === 'DRAFT')
        throw new ConflictException('اعتمد المصروف قبل إنشاء تسوية');
      const adjustment = await tx.expenseAdjustment.create({
        data: {
          organizationId: orgId,
          expenseId: id,
          type: dto.type,
          amount: new Prisma.Decimal(dto.amount),
          reason: dto.reason,
          createdById: user.sub,
        },
      });
      await tx.expense.update({ where: { id }, data: { status: 'ADJUSTED' } });
      return adjustment;
    });
    await this.audit.log(user, 'EXPENSE_ADJUSTED', 'Expense', id, {
      adjustmentId: result.id,
      type: dto.type,
      amount: dto.amount,
      reason: dto.reason,
    });
    return result;
  }

  private async validateReferences(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    tripId?: string,
    busId?: string,
  ) {
    const [trip, bus] = await Promise.all([
      tripId
        ? tx.trip.findFirst({
            where: { id: tripId, ...tenantScope(user) },
            select: { id: true, busId: true },
          })
        : Promise.resolve(null),
      busId
        ? tx.bus.findFirst({
            where: { id: busId, ...tenantScope(user) },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (tripId && !trip) throw new NotFoundException('الرحلة غير موجودة');
    if (busId && !bus) throw new NotFoundException('الباص غير موجود');
    if (trip && busId && trip.busId !== busId) {
      throw new ConflictException('الباص المحدد لا يطابق باص الرحلة');
    }
  }

  private async ensureExists(user: AuthUser, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, ...tenantScope(user) },
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    return expense;
  }
}
