import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Phase 5 (Option A — Owner-approved): بيانات العرض نقدًا فقط.
 *
 * الطرق الرقمية محفوظة في الـ enum لكن تسجيلها عبر الـ API ممنوع
 * حتى وجود سياسة providers + reconciliation (قرار المالك: مؤجلة).
 * البيانات التجريبية كانت تخلق مدفوعات رقمية وهمية (phantom) تُفسد
 * الـ invariant الجديد «لا مدفوعات رقمية» وتضلل التقارير المالية
 * التجريبية — الحجوزات النقدية كافية تمامًا للعرض.
 */
const PAYMENT_METHODS = ['CASH'] as const;

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * رقم المقعد الرسمي: أرقام فقط، مشتق من الموضع داخل الحافلة
 * (نفس اشتقاق seat-templates.service في الواجهة الخلفية) —
 * التذاكر وقوائم المسافرين تعرض رقمًا واحدًا يقرؤه الجميع.
 */
function seatLabel(row: number, col: number): string {
  const columnsPerRow = 4; // تخطيط 2+2 القياسي في seed-demo
  return String((row - 1) * columnsPerRow + col);
}

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error('Run `pnpm db:seed` first to create the organization.');

  const admin = await prisma.user.findFirst({
    where: { email: process.env.INITIAL_ADMIN_EMAIL ?? 'admin@ticketty.local' },
  });
  if (!admin) throw new Error('Admin user not found. Run `pnpm db:seed` first.');

  const existingBus = await prisma.bus.findFirst({
    where: { organizationId: org.id },
  });
  if (existingBus) {
    console.log('Demo data already exists. Skipping.');
    return;
  }

  // 1) Seat template (2+2 = 4 columns, aisle after column 2)
  const template = await prisma.seatTemplate.create({
    data: {
      organizationId: org.id,
      name: 'حافلة VIP 2+2',
      rows: 10,
      columnsPerRow: 4,
      aisleAfterColumn: 2,
    },
  });

  const seats = [];
  for (let row = 1; row <= template.rows; row++) {
    for (let col = 1; col <= template.columnsPerRow; col++) {
      seats.push({
        seatTemplateId: template.id,
        row,
        column: col,
        label: seatLabel(row, col),
        seatType: 'REGULAR' as const,
      });
    }
  }
  await prisma.seat.createMany({ data: seats });

  // 2) Buses
  const busPlates = ['SDN-1101', 'SDN-1102', 'SDN-1103'];
  const buses = [];
  for (const plateNumber of busPlates) {
    buses.push(
      await prisma.bus.create({
        data: {
          organizationId: org.id,
          plateNumber,
          model: 'مرسيدس ترافكو',
          year: 2022,
          seatTemplateId: template.id,
        },
      }),
    );
  }

  // 3) Routes
  const routeData = [
    { name: 'الخرطوم - بورتسودان', fromCity: 'الخرطوم', toCity: 'بورتسودان' },
    { name: 'الخرطوم - مدني', fromCity: 'الخرطوم', toCity: 'مدني' },
    { name: 'الخرطوم - كسلا', fromCity: 'الخرطوم', toCity: 'كسلا' },
  ];
  const routes = [];
  for (const r of routeData) {
    routes.push(
      await prisma.route.create({
        data: { organizationId: org.id, ...r },
      }),
    );
  }

  // 4) Agents
  const agents = [];
  const agentData = [
    { name: 'وكالة النيل للسفر', type: 'EXTERNAL' as const },
    { name: 'مكتب المدينة', type: 'INTERNAL' as const },
  ];
  for (const a of agentData) {
    agents.push(
      await prisma.agent.create({
        data: {
          organizationId: org.id,
          name: a.name,
          phone: '0912000000',
          type: a.type,
          commissionType: 'PERCENT',
          commissionValue: 5,
        },
      }),
    );
  }

  // 5) Customers
  const customerData = [
    { name: 'أحمد محمد', phone: '0911111111' },
    { name: 'سارة علي', phone: '0922222222' },
    { name: 'خالد عثمان', phone: '0933333333' },
    { name: 'منى إبراهيم', phone: '0944444444' },
    { name: 'عمر حسن', phone: '0955555555' },
  ];
  const customers = [];
  for (const c of customerData) {
    customers.push(
      await prisma.customer.create({
        data: { organizationId: org.id, ...c },
      }),
    );
  }

  // 6) Trips + bookings + tickets + payments over the last 7 days
  const base = todayUtc();
  let ticketSeq = 1000;

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const day = new Date(base.getTime() - dayOffset * 86400000);
    // 1-3 trips per day (more trips today)
    const tripsCount = dayOffset === 0 ? 3 : dayOffset % 2 === 0 ? 2 : 1;

    for (let t = 0; t < tripsCount; t++) {
      const route = routes[t % routes.length];
      const bus = buses[t % buses.length];
      const departureAt = new Date(day.getTime() + (6 + t * 3) * 3600000);
      const tripFare = 5000 + ((dayOffset + t) % 5) * 1500;

      const trip = await prisma.trip.create({
        data: {
          organizationId: org.id,
          routeId: route.id,
          busId: bus.id,
          driverName: `سائق ${t + 1}`,
          driverPhone: '0990000000',
          departureAt,
          status: dayOffset === 0 ? 'SCHEDULED' : 'COMPLETED',
          tripSeats: {
            create: seats.map((seat) => ({
              row: seat.row,
              column: seat.column,
              label: seat.label,
              seatType: seat.seatType,
              price: tripFare,
            })),
          },
        },
      });

      const bookingsCount = 1 + ((dayOffset + t) % 3);
      for (let b = 0; b < bookingsCount; b++) {
        const customer = customers[(dayOffset + t + b) % customers.length];
        const agent = (dayOffset + b) % 3 === 0 ? agents[0] : null;

        const seatNumber = b + 1 + t;
        const row = Math.floor(seatNumber / template.columnsPerRow) + 1;
        const col = (seatNumber % template.columnsPerRow) + 1;
        const label = seatLabel(row, col);
        const fare = 5000 + ((dayOffset + t + b) % 5) * 1500;

        const createdAt = new Date(
          day.getTime() + (8 + b * 2) * 3600000,
        );

        const tripSeat = await prisma.tripSeat.update({
          where: { tripId_label: { tripId: trip.id, label } },
          data: { price: fare, status: 'BOOKED' },
        });

        const booking = await prisma.booking.create({
          data: {
            organizationId: org.id,
            tripId: trip.id,
            customerId: customer.id,
            agentId: agent?.id,
            createdById: admin.id,
            totalAmount: fare,
            status: 'CONFIRMED',
            createdAt,
          },
        });

        await prisma.ticket.create({
          data: {
            organizationId: org.id,
            bookingId: booking.id,
            tripId: trip.id,
            tripSeatId: tripSeat.id,
            number: `TK-${String(ticketSeq++).padStart(6, '0')}`,
            passengerName: customer.name,
            passengerPhone: customer.phone,
            seatLabel: label,
            fare,
            status: 'BOOKED',
            qrCode: `qr-${booking.id}`,
            createdAt,
          },
        });

        await prisma.payment.create({
          data: {
            organizationId: org.id,
            bookingId: booking.id,
            amount: fare,
            method: PAYMENT_METHODS[(dayOffset + t + b) % PAYMENT_METHODS.length],
            receivedById: admin.id,
            createdAt: new Date(createdAt.getTime() + 30 * 60000),
          },
        });
      }
    }
  }

  console.log('Demo data seeded: routes, buses, trips, bookings, tickets, payments.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
