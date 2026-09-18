import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const readAll = [
  'customers.read', 'routes.read', 'fleet.read', 'trips.read',
  'bookings.read', 'tickets.read', 'payments.read', 'agents.read',
  'expenses.read', 'settlements.read', 'manifests.read', 'reports.read',
  'accounting.read',
];

const roles = [
  ['OWNER', 'مالك النظام', 'Owner', ['*', 'platform.admin']],
  ['OPS_MANAGER', 'مدير العمليات', 'Operations Manager', [...readAll, 'routes.write', 'fleet.write', 'trips.write', 'manifests.write']],
  ['FINANCE', 'المالية والمحاسبة', 'Finance / Accountant', [...readAll, 'payments.write', 'agents.write', 'expenses.write', 'expenses.approve', 'settlements.write', 'accounting.write', 'accounting.post', 'accounting.close']],
  ['STATION_MANAGER', 'مدير المحطة', 'Station Manager', [...readAll, 'bookings.write', 'tickets.write', 'customers.write', 'payments.write', 'manifests.write']],
  ['SELLER', 'البائع', 'Seller', ['trips.read', 'bookings.read', 'bookings.write', 'tickets.read', 'tickets.write', 'customers.read', 'customers.write', 'manifests.read', 'payments.read']],
  ['AGENT', 'وكيل خارجي', 'External Agent', ['trips.read', 'bookings.read.own', 'bookings.write.own', 'tickets.read.own', 'tickets.write.own', 'customers.read', 'customers.write', 'payments.read.own', 'agents.read.own', 'settlements.read.own']],
  ['VIEWER', 'مراجع / مدقق', 'Viewer / Auditor', readAll],
];

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) {
  throw new Error('INITIAL_ADMIN_EMAIL and a 12-character INITIAL_ADMIN_PASSWORD are required');
}

try {
  const organization = await prisma.organization.upsert({
    where: { slug: process.env.INITIAL_ORG_SLUG?.trim() || 'ticketty' },
    update: {},
    create: {
      name: process.env.INITIAL_ORG_NAME?.trim() || 'Ticketty',
      slug: process.env.INITIAL_ORG_SLUG?.trim() || 'ticketty',
    },
  });

  const roleIds = {};
  for (const [key, nameAr, nameEn, permissions] of roles) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: organization.id, key } },
      update: { permissions },
      create: { organizationId: organization.id, key, nameAr, nameEn, permissions, isSystem: true },
    });
    roleIds[key] = role.id;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        organizationId: organization.id,
        roleId: roleIds.OWNER,
        name: process.env.INITIAL_ADMIN_NAME?.trim() || 'مدير النظام',
        email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`Created initial owner: ${email}`);
  } else {
    console.log(`Initial owner already exists: ${email}`);
  }
} finally {
  await prisma.$disconnect();
}
