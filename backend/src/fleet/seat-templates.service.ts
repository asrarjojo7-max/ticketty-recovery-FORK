import { Injectable, NotFoundException } from '@nestjs/common';
import { SeatType } from '@prisma/client';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSeatTemplateDto,
  QueryFleetDto,
  UpdateSeatTemplateDto,
} from './dto';

/**
 * ترقيم المقاعد: أرقام فقط (1، 2، 3، …) لكل الحافلة.
 *
 * الرقم يُشتق من موضع المقعد داخل الحافلة (يمين-يسار، صف-صف)
 * وليس من حرف عمود — هذا هو الترقيم الذي يفهمه الراكب والكاشير
 * وموظف الصعود. الترتيب القياسي لحافلة 2+2 (الممر بعد العمود 2):
 *
 *   الصف 1: 1  2 | 3  4
 *   الصف 2: 5  6 | 7  8   …
 *
 * تنفيذ الاشتقاق مشترك بين الحافلة والواجهة (نفس الترتيب في POS
 * والتذكرة والمنفستو) — القاعدة الوحيدة: رقم واحد لكل مقعد قابل
 * للبيع، ومقاعد السائق/المعطلة لا تستهلك أرقامًا (لا تُباع أصلًا).
 */
export function seatNumberFor(
  row: number,
  column: number,
  columnsPerRow: number,
): number {
  return (row - 1) * columnsPerRow + column;
}

export function generateSeatNumberLabel(
  row: number,
  column: number,
  columnsPerRow: number,
): string {
  return String(seatNumberFor(row, column, columnsPerRow));
}

export function isNumericSeatLabel(label: string): boolean {
  return /^\d{1,3}$/.test(label);
}

function generateSeats(rows: number, columnsPerRow: number) {
  const seats: Array<{
    row: number;
    column: number;
    label: string;
    seatType: SeatType;
  }> = [];
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columnsPerRow; column += 1) {
      seats.push({
        row,
        column,
        label: generateSeatNumberLabel(row, column, columnsPerRow),
        seatType: SeatType.REGULAR,
      });
    }
  }
  return seats;
}

@Injectable()
export class SeatTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(orgId: string, dto: CreateSeatTemplateDto) {
    const { rows, columnsPerRow, seats, ...data } = dto;
    // الترقيم الرسمي أرقام فقط. المدخل قد يأتي بحروف عمود قديمة
    // (A1) من صانع القوالب — نعيد اشتقاق الرقم من الموضع دائمًا
    // كي تبقى العرضة والتذكرة متسقة مع خريطة المقاعد.
    const seatRows = seats?.length
      ? seats.map((s) => ({
          row: s.row,
          column: s.column,
          label: generateSeatNumberLabel(s.row, s.column, columnsPerRow),
          seatType: s.seatType ?? SeatType.REGULAR,
        }))
      : generateSeats(rows, columnsPerRow);

    return this.prisma.seatTemplate.create({
      data: {
        ...data,
        rows,
        columnsPerRow,
        organizationId: orgId,
        seats: { create: seatRows },
      },
      include: { seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] } },
    });
  }

  findAll(orgId: string, query: QueryFleetDto = {}) {
    return this.prisma.seatTemplate.findMany({
      where: { organizationId: orgId },
      include: {
        seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
        _count: { select: { buses: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(orgId: string, id: string) {
    const template = await this.prisma.seatTemplate.findFirst({
      where: { id, organizationId: orgId },
      include: {
        seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
        buses: true,
      },
    });
    if (!template) throw new NotFoundException('قالب المقاعد غير موجود');
    return template;
  }

  async update(orgId: string, id: string, dto: UpdateSeatTemplateDto) {
    await this.ensureExists(orgId, id);
    return this.prisma.seatTemplate.update({
      where: { id },
      data: dto,
      include: { seats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] } },
    });
  }

  async remove(orgId: string, id: string) {
    await this.ensureExists(orgId, id);
    return this.prisma.seatTemplate.delete({ where: { id } });
  }

  private async ensureExists(orgId: string, id: string) {
    const template = await this.prisma.seatTemplate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!template) throw new NotFoundException('قالب المقاعد غير موجود');
    return template;
  }
}
