import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  PaginationQueryDto,
  paginationArgs,
} from '../common/dto/pagination-query.dto';
import { requireOrgId } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBranchDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateOrganizationDto,
  UpdateTicketBrandingDto,
  UpdateUserDto,
} from './dto';

export type TicketBrandAssetKind = 'logo' | 'bus';

export function ticketBrandAssetKind(value: string): TicketBrandAssetKind {
  if (value !== 'logo' && value !== 'bus') {
    throw new BadRequestException('نوع صورة الهوية غير صالح');
  }
  return value;
}

export function contrastWithWhite(hex: string): number {
  const rgb = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255,
  );
  const luminance = rgb
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4),
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
  return 1.05 / (luminance + 0.05);
}

const TICKET_BRANDING_DEFAULTS = {
  tagline: null,
  primaryColor: '#07558C',
  secondaryColor: '#F7941D',
  checkInMinutes: 30,
  baggagePieces: 1,
} as const;

export function detectTicketBrandImageMime(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return null;
}

export function canGrantPermissions(
  actorPermissions: string[],
  requestedPermissions: string[],
): boolean {
  if (actorPermissions.includes('*')) return true;
  return requestedPermissions.every((permission) => {
    if (permission === '*') return false;
    const [domain] = permission.split('.');
    const broaderPermission = permission.endsWith('.own')
      ? permission.slice(0, -4)
      : undefined;
    return (
      actorPermissions.includes(permission) ||
      actorPermissions.includes(`${domain}.*`) ||
      (broaderPermission !== undefined &&
        actorPermissions.includes(broaderPermission))
    );
  });
}

@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async organization(user: AuthUser) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: requireOrgId(user) },
      include: {
        ticketBranding: {
          select: {
            tagline: true,
            primaryColor: true,
            secondaryColor: true,
            checkInMinutes: true,
            baggagePieces: true,
            logoMime: true,
            logoBytes: true,
            logoSha256: true,
            busImageMime: true,
            busImageBytes: true,
            busImageSha256: true,
            updatedAt: true,
          },
        },
      },
    });
    return this.withTicketBrandingUrls(organization);
  }
  async updateOrganization(user: AuthUser, dto: UpdateOrganizationDto) {
    const organizationId = requireOrgId(user);
    await this.prisma.$transaction((tx) =>
      tx.organization.update({
        where: { id: organizationId },
        data: {
          ...dto,
          cancellationFeePercent:
            dto.cancellationFeePercent !== undefined
              ? new Prisma.Decimal(dto.cancellationFeePercent)
              : undefined,
        },
      }),
    );
    await this.audit.log(
      user,
      'ORGANIZATION_UPDATED',
      'Organization',
      organizationId,
    );
    return this.organization(user);
  }
  async updateTicketBranding(user: AuthUser, dto: UpdateTicketBrandingDto) {
    const organizationId = requireOrgId(user);
    const normalized = {
      ...dto,
      primaryColor: dto.primaryColor?.toUpperCase(),
      secondaryColor: dto.secondaryColor?.toUpperCase(),
      tagline: dto.tagline?.trim() || null,
    };
    if (
      normalized.primaryColor &&
      contrastWithWhite(normalized.primaryColor) < 4.5
    ) {
      throw new BadRequestException(
        'اللون الرئيسي فاتح جدًا ولا يحقق وضوح النص الأبيض',
      );
    }
    await this.prisma.organizationTicketBranding.upsert({
      where: { organizationId },
      create: { organizationId, ...normalized },
      update: normalized,
    });
    await this.audit.log(
      user,
      'ORGANIZATION_TICKET_BRANDING_UPDATED',
      'Organization',
      organizationId,
      { ...normalized },
    );
    return this.organization(user);
  }

  async setTicketBrandAsset(
    user: AuthUser,
    kind: TicketBrandAssetKind,
    file?: { buffer: Buffer; size: number },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('اختر ملف صورة صالحًا');
    }
    const sizeLimit = kind === 'logo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > sizeLimit) {
      throw new BadRequestException(
        `حجم الصورة يجب ألا يتجاوز ${kind === 'logo' ? 2 : 8} ميجابايت`,
      );
    }
    if (!detectTicketBrandImageMime(file.buffer)) {
      throw new BadRequestException('الصيغ المسموحة: PNG أو WebP أو JPEG');
    }
    const normalized = await this.normalizeTicketBrandImage(file.buffer, kind);
    const sha256 = createHash('sha256').update(normalized).digest('hex');
    const mime = 'image/webp';
    const organizationId = requireOrgId(user);
    const assetData =
      kind === 'logo'
        ? {
            logo: Uint8Array.from(normalized),
            logoMime: mime,
            logoBytes: normalized.length,
            logoSha256: sha256,
          }
        : {
            busImage: Uint8Array.from(normalized),
            busImageMime: mime,
            busImageBytes: normalized.length,
            busImageSha256: sha256,
          };
    await this.prisma.organizationTicketBranding.upsert({
      where: { organizationId },
      create: { organizationId, ...assetData },
      update: assetData,
    });
    await this.audit.log(
      user,
      'ORGANIZATION_TICKET_BRAND_ASSET_UPDATED',
      'Organization',
      organizationId,
      { kind, mime, bytes: normalized.length, sha256 },
    );
    return this.organization(user);
  }

  async ticketBrandAsset(user: AuthUser, kind: TicketBrandAssetKind) {
    const branding = await this.prisma.organizationTicketBranding.findUnique({
      where: { organizationId: requireOrgId(user) },
    });
    const buffer = kind === 'logo' ? branding?.logo : branding?.busImage;
    const mime = kind === 'logo' ? branding?.logoMime : branding?.busImageMime;
    const sha256 =
      kind === 'logo' ? branding?.logoSha256 : branding?.busImageSha256;
    if (!buffer || !mime || !sha256) {
      throw new NotFoundException('صورة الهوية غير موجودة');
    }
    return { buffer: Buffer.from(buffer), mime, sha256 };
  }

  async deleteTicketBrandAsset(user: AuthUser, kind: TicketBrandAssetKind) {
    const organizationId = requireOrgId(user);
    await this.prisma.organizationTicketBranding.upsert({
      where: { organizationId },
      create: { organizationId },
      update:
        kind === 'logo'
          ? { logo: null, logoMime: null, logoBytes: null, logoSha256: null }
          : {
              busImage: null,
              busImageMime: null,
              busImageBytes: null,
              busImageSha256: null,
            },
    });
    await this.audit.log(
      user,
      'ORGANIZATION_TICKET_BRAND_ASSET_DELETED',
      'Organization',
      organizationId,
      { kind },
    );
    return this.organization(user);
  }

  private async normalizeTicketBrandImage(
    buffer: Buffer,
    kind: TicketBrandAssetKind,
  ): Promise<Buffer> {
    try {
      const image = sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: 24_000_000,
      }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('missing dimensions');
      }
      const maxDimension = kind === 'logo' ? 1200 : 2400;
      return await image
        .resize({
          width: maxDimension,
          height: maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp(kind === 'logo' ? { lossless: true } : { quality: 90 })
        .toBuffer();
    } catch {
      throw new BadRequestException('تعذر قراءة الصورة أو أن أبعادها غير آمنة');
    }
  }

  private withTicketBrandingUrls<
    T extends {
      ticketBranding: {
        logoMime: string | null;
        logoSha256: string | null;
        busImageMime: string | null;
        busImageSha256: string | null;
        updatedAt: Date;
      } | null;
    },
  >(organization: T) {
    const branding = organization.ticketBranding;
    const logoVersion = branding?.logoSha256?.slice(0, 12);
    const busVersion = branding?.busImageSha256?.slice(0, 12);
    return {
      ...organization,
      ticketBranding: {
        ...TICKET_BRANDING_DEFAULTS,
        ...branding,
        logoUrl: branding?.logoMime
          ? `/api/proxy/administration/organization/ticket-branding/assets/logo?v=${logoVersion}`
          : null,
        busImageUrl: branding?.busImageMime
          ? `/api/proxy/administration/organization/ticket-branding/assets/bus?v=${busVersion}`
          : null,
      },
    };
  }

  branches(user: AuthUser, query: PaginationQueryDto = {}) {
    return this.prisma.branch.findMany({
      where: { organizationId: requireOrgId(user) },
      include: { _count: { select: { users: true, trips: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      ...paginationArgs(query),
    });
  }
  async createBranch(user: AuthUser, dto: CreateBranchDto) {
    const branch = await this.prisma.$transaction((tx) =>
      tx.branch.create({
        data: { ...dto, organizationId: requireOrgId(user) },
      }),
    );
    await this.audit.log(user, 'BRANCH_CREATED', 'Branch', branch.id);
    return branch;
  }
  roles(user: AuthUser, query: PaginationQueryDto = {}) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ organizationId: requireOrgId(user) }, { organizationId: null }],
      },
      include: { _count: { select: { users: true } } },
      orderBy: [{ nameAr: 'asc' }, { id: 'asc' }],
      ...paginationArgs(query),
    });
  }
  async createRole(user: AuthUser, dto: CreateRoleDto) {
    this.ensureGrantablePermissions(user, dto.permissions);
    const role = await this.prisma.$transaction((tx) =>
      tx.role.create({
        data: {
          ...dto,
          key: dto.key.trim().toUpperCase(),
          organizationId: requireOrgId(user),
        },
      }),
    );
    await this.audit.log(user, 'ROLE_CREATED', 'Role', role.id);
    return role;
  }
  users(user: AuthUser, query: PaginationQueryDto = {}) {
    return this.prisma.user.findMany({
      where: { organizationId: requireOrgId(user) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
        branch: true,
        role: {
          select: { id: true, key: true, nameAr: true, permissions: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }
  async createUser(user: AuthUser, dto: CreateUserDto) {
    const organizationId = requireOrgId(user);
    await this.validateRefs(user, dto.roleId, dto.branchId);
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (exists) throw new ConflictException('البريد الإلكتروني مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.prisma.$transaction((tx) =>
      tx.user.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone,
          roleId: dto.roleId,
          branchId: dto.branchId,
          passwordHash,
          mustChangePassword: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          active: true,
          mustChangePassword: true,
          branch: true,
          role: true,
          createdAt: true,
        },
      }),
    );
    await this.audit.log(user, 'USER_CREATED', 'User', created.id);
    return created;
  }
  async updateUser(user: AuthUser, id: string, dto: UpdateUserDto) {
    const organizationId = requireOrgId(user);
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('المستخدم غير موجود');
    if (id === user.sub && dto.active === false)
      throw new ConflictException('لا يمكنك تعطيل حسابك الحالي');
    await this.validateRefs(user, dto.roleId, dto.branchId);
    const updated = await this.prisma.$transaction((tx) =>
      tx.user.update({
        where: { id },
        data: dto,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          active: true,
          branch: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
    await this.audit.log(user, 'USER_UPDATED', 'User', id, {
      active: dto.active,
      roleId: dto.roleId,
      branchId: dto.branchId,
    });
    return updated;
  }
  private async validateRefs(
    user: AuthUser,
    roleId?: string,
    branchId?: string,
  ) {
    const orgId = requireOrgId(user);
    if (roleId) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: roleId,
          OR: [{ organizationId: orgId }, { organizationId: null }],
        },
        select: { permissions: true },
      });
      if (!role) throw new NotFoundException('الدور غير موجود');
      this.ensureGrantablePermissions(user, role.permissions);
    }
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, organizationId: orgId },
      });
      if (!branch) throw new NotFoundException('الفرع غير موجود');
    }
  }

  private ensureGrantablePermissions(
    user: AuthUser,
    requestedPermissions: string[],
  ): void {
    if (!canGrantPermissions(user.permissions, requestedPermissions)) {
      throw new ForbiddenException(
        'لا يمكنك منح صلاحيات أعلى من صلاحيات حسابك',
      );
    }
  }
}
