import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 128;
const RETENTION_HOURS = 24;

export function requireIdempotencyKey(key?: string): string {
  if (!key || key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    throw new BadRequestException('يلزم إرسال Idempotency-Key صالح');
  }
  return key;
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function idempotencyRequestHash(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

export async function beginIdempotentOperation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  endpoint: string,
  key: string,
  requestHash: string,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`idempotency:${organizationId}:${endpoint}`}),
      hashtext(${key})
    )
  `;
  const existing = await tx.idempotencyRecord.findUnique({
    where: { organizationId_endpoint_key: { organizationId, endpoint, key } },
  });
  if (existing) {
    // A completed financial/business mutation remains replayable even after the
    // processing lease expires. Reusing its key for new work would otherwise
    // duplicate a durable business effect. Only stale incomplete attempts may
    // be discarded and retried.
    if (
      existing.status === IdempotencyStatus.COMPLETED ||
      existing.expiresAt > new Date()
    ) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('أُعيد استخدام مفتاح الطلب بمحتوى مختلف');
      }
      return { record: existing, replay: true } as const;
    }
    await tx.idempotencyRecord.delete({ where: { id: existing.id } });
  }

  const record = await tx.idempotencyRecord.create({
    data: {
      organizationId,
      endpoint,
      key,
      requestHash,
      expiresAt: new Date(Date.now() + RETENTION_HOURS * 60 * 60 * 1000),
    },
  });
  return { record, replay: false } as const;
}

export function completeIdempotentOperation(
  tx: Prisma.TransactionClient,
  id: string,
  resourceType: string,
  resourceId: string,
) {
  return tx.idempotencyRecord.update({
    where: { id },
    data: {
      status: IdempotencyStatus.COMPLETED,
      responseStatus: 200,
      resourceType,
      resourceId,
    },
  });
}
