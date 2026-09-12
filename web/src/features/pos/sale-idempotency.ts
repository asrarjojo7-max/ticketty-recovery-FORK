import type { CreateBookingInput } from "@/features/bookings";

const STORAGE_KEY = "ticketty:pos:pending-sales:v1";
const RETENTION_MS = 24 * 60 * 60 * 1000;

type StoredSale = { key: string; createdAt: number };
type StoredSales = Record<string, StoredSale>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

async function saleFingerprint(input: CreateBookingInput): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(input)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function readSales(storage: StorageLike, now: number): StoredSales {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as StoredSales;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, record]) =>
          typeof record?.key === "string" &&
          typeof record.createdAt === "number" &&
          now - record.createdAt < RETENTION_MS,
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Returns one key for one logical sale until the server confirms success.
 * Only a SHA-256 fingerprint and random key are stored; passenger data is not.
 */
export async function idempotencyKeyForSale(
  input: CreateBookingInput,
  storage: StorageLike = window.sessionStorage,
  now = Date.now(),
): Promise<string> {
  const fingerprint = await saleFingerprint(input);
  const sales = readSales(storage, now);
  const existing = sales[fingerprint];
  if (existing) return existing.key;

  const key = crypto.randomUUID();
  sales[fingerprint] = { key, createdAt: now };
  storage.setItem(STORAGE_KEY, JSON.stringify(sales));
  return key;
}

export async function clearSaleIdempotencyKey(
  input: CreateBookingInput,
  storage: StorageLike = window.sessionStorage,
): Promise<void> {
  const fingerprint = await saleFingerprint(input);
  const sales = readSales(storage, Date.now());
  delete sales[fingerprint];
  storage.setItem(STORAGE_KEY, JSON.stringify(sales));
}
