import { AccountingEventType, Prisma } from '@prisma/client';

export function enqueueAccountingEvent(
  tx: Prisma.TransactionClient,
  organizationId: string,
  eventType: AccountingEventType,
  sourceId: string,
) {
  return tx.accountingEvent.upsert({
    where: {
      organizationId_eventType_sourceId: {
        organizationId,
        eventType,
        sourceId,
      },
    },
    create: { organizationId, eventType, sourceId },
    update: {},
  });
}
