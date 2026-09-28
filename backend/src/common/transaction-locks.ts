import { Prisma } from '@prisma/client';

/**
 * Serializes every transaction that can sell, cancel, or depart the same trip.
 * All participating use cases must acquire this lock before reading mutable
 * trip, booking, seat, payment, or manifest state.
 */
export async function lockTripTransaction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  tripId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`ticketty:${organizationId}`}),
      hashtext(${`trip:${tripId}`})
    )
  `;
}

/**
 * Serializes allocation of the human-readable ticket sequence for one
 * organization and calendar year. A trip lock is insufficient because two
 * application instances can sell different trips for the same organization.
 * PostgreSQL transaction advisory locks are shared by every application
 * instance and release automatically on commit/rollback.
 */
export async function lockTicketNumberSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  year: number,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`ticketty:ticket-number`}),
      hashtext(${`${organizationId}:${year}`})
    )
  `;

}
/**
 * Serializes every transaction that can create/post/close entries in the same
 * fiscal period. createEntry() and closePeriod() both take this lock before
 * reading the period so a period cannot become CLOSED between a successful
 * OPEN check and the subsequent write.
 */
export async function lockFiscalPeriodTransaction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  fiscalPeriodId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtext(${`ticketty:fiscal-period`}),
      hashtext(${`${organizationId}:${fiscalPeriodId}`})
    )
  `;
}
