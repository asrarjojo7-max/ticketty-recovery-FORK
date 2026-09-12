import { describe, expect, it, vi } from "vitest";
import type { CreateBookingInput } from "@/features/bookings";
import {
  clearSaleIdempotencyKey,
  idempotencyKeyForSale,
} from "./sale-idempotency";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

const sale: CreateBookingInput = {
  tripId: "trip-1",
  seatIds: ["seat-1"],
  passengers: [
    {
      seatId: "seat-1",
      passengerName: "Passenger",
      passengerPhone: "0912000000",
    },
  ],
  paymentMethod: "CASH",
};

describe("POS sale idempotency key", () => {
  it("survives retries and payload key-order differences", async () => {
    const storage = memoryStorage();
    const random = vi.spyOn(crypto, "randomUUID");

    const first = await idempotencyKeyForSale(sale, storage, 1_000);
    const retry = await idempotencyKeyForSale(
      { paymentMethod: "CASH", passengers: sale.passengers, seatIds: ["seat-1"], tripId: "trip-1" },
      storage,
      2_000,
    );

    expect(retry).toBe(first);
    expect(random).toHaveBeenCalledTimes(1);
    random.mockRestore();
  });

  it("allocates a new key after definitive success", async () => {
    const storage = memoryStorage();
    const first = await idempotencyKeyForSale(sale, storage, 1_000);
    await clearSaleIdempotencyKey(sale, storage);
    const next = await idempotencyKeyForSale(sale, storage, 2_000);
    expect(next).not.toBe(first);
  });

  it("replaces a stale pending key after 24 hours", async () => {
    const storage = memoryStorage();
    const first = await idempotencyKeyForSale(sale, storage, 1_000);
    const next = await idempotencyKeyForSale(
      sale,
      storage,
      1_000 + 24 * 60 * 60 * 1000,
    );
    expect(next).not.toBe(first);
  });

  it("does not reuse a key for different sale content", async () => {
    const storage = memoryStorage();
    const first = await idempotencyKeyForSale(sale, storage, 1_000);
    const second = await idempotencyKeyForSale(
      { ...sale, seatIds: ["seat-2"] },
      storage,
      1_000,
    );
    expect(second).not.toBe(first);
  });
});
