import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// اتفاقية الصلاحيات: <domain>.read | <domain>.write
// OWNER يمتلك '*' وهي تطابق كل شيء في PermissionsGuard.
const READ_ALL = [
  'customers.read',
  'routes.read',
  'fleet.read',
  'trips.read',
  'bookings.read',
  'tickets.read',
  'payments.read',
  'agents.read',
  'expenses.read',
  'settlements.read',
  'manifests.read',
  'reports.read',
  'accounting.read',
];

interface RoleSeed {
  key: string;
  nameAr: string;
  nameEn: string;
  permissions: string[];
}

const ROLES: RoleSeed[] = [
  { key: 'OWNER', nameAr: 'مالك النظام', nameEn: 'Owner', permissions: ['*'] },
  {
    key: 'OPS_MANAGER',
    nameAr: 'مدير العمليات',
    nameEn: 'Operations Manager',
    permissions: [
      ...READ_ALL,
      'routes.write',
      'fleet.write',
      'trips.write',
      'manifests.write',
    ],
  },
  {
    key: 'FINANCE',
    nameAr: 'المالية والمحاسبة',
    nameEn: 'Finance / Accountant',
    permissions: [
      ...READ_ALL,
      'payments.write',
      'agents.write',
      'expenses.write',
      'expenses.approve',
      'settlements.write',
      'accounting.write',
      'accounting.post',
      'accounting.close',
    ],
  },
  {
    key: 'STATION_MANAGER',
    nameAr: 'مدير المحطة',
    nameEn: 'Station Manager',
    permissions: [
      ...READ_ALL,
      'bookings.write',
      'tickets.write',
      'customers.write',
      'payments.write',
      'manifests.write',
    ],
  },
  {
    key: 'SELLER',
    nameAr: 'البائع',
    nameEn: 'Seller',
    permissions: [
      'trips.read',
      'bookings.read',
      'bookings.write',
      'tickets.read',
      'tickets.write',
      'customers.read',
      'customers.write',
      'manifests.read',
      'payments.read',
    ],
  },
  {
    key: 'AGENT',
    nameAr: 'وكيل خارجي',
    nameEn: 'External Agent',
    permissions: [
      'trips.read',
      'bookings.read.own',
      'bookings.write.own',
      'tickets.read.own',
      'tickets.write.own',
      'customers.read',
      'customers.write',
      'payments.read.own',
      'agents.read.own',
      'settlements.read.own',
    ],
  },
  {
    key: 'VIEWER',
    nameAr: 'مراجع / مدقق',
    nameEn: 'Viewer / Auditor',
    permissions: [...READ_ALL],
  },
];

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const organizationName = process.env.INITIAL_ORG_NAME?.trim() || 'Ticketty';
  const organizationSlug = process.env.INITIAL_ORG_SLUG?.trim() || 'ticketty';

  if (!email || !password) {
    throw new Error(
      'INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are required to seed the database',
    );
  }
  if (password.length < 12) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD must contain at least 12 characters',
    );
  }

  const organization = await prisma.organization.upsert({
    where: { slug: organizationSlug },
    update: {},
    create: { name: organizationName, slug: organizationSlug },
  });

  const roles: Record<string, { id: string }> = {};
  for (const role of ROLES) {
    const upserted = await prisma.role.upsert({
      where: {
        organizationId_key: {
          organizationId: organization.id,
          key: role.key,
        },
      },
      update: { permissions: role.permissions },
      create: {
        organizationId: organization.id,
        key: role.key,
        nameAr: role.nameAr,
        nameEn: role.nameEn,
        permissions: role.permissions,
        isSystem: true,
      },
    });
    roles[role.key] = { id: upserted.id };
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log(`Admin user already exists: ${email}`);
    console.log(`Seeded organization and ${ROLES.length} roles.`);
    return;
  }

  await prisma.user.create({
    data: {
      organizationId: organization.id,
      roleId: roles.OWNER.id,
      name: process.env.INITIAL_ADMIN_NAME?.trim() || 'مدير النظام',
      email,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });

  console.log(
    `Created organization, ${ROLES.length} roles, and admin user: ${email}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
