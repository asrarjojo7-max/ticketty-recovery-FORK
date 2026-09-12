import {
  generateSeatNumberLabel,
  isNumericSeatLabel,
  seatNumberFor,
  SeatTemplatesService,
} from './seat-templates.service';

describe('numeric seat numbering (data-driven layout)', () => {
  it('derives sequential numbers for a 2+2 coach (10 rows x 4 columns)', () => {
    // الصف 1: 1 2 | 3 4 — الصف 2: 5 6 | 7 8 …
    expect(seatNumberFor(1, 1, 4)).toBe(1);
    expect(seatNumberFor(1, 2, 4)).toBe(2);
    expect(seatNumberFor(1, 3, 4)).toBe(3);
    expect(seatNumberFor(1, 4, 4)).toBe(4);
    expect(seatNumberFor(2, 1, 4)).toBe(5);
    expect(seatNumberFor(2, 4, 4)).toBe(8);
    expect(seatNumberFor(10, 4, 4)).toBe(40);
  });

  it('derives numbers for other layouts (45/49/51 seats)', () => {
    // 45 مقعدًا = 15 صفًا × 3 (2+1)
    expect(seatNumberFor(15, 3, 3)).toBe(45);
    // 51 مقعدًا = 17 صفًا × 3
    expect(seatNumberFor(17, 3, 3)).toBe(51);
    // 49 مقعدًا = 12 صفًا × 4 + 1
    expect(seatNumberFor(12, 4, 4)).toBe(48);
  });

  it('produces plain digit labels (never letters)', () => {
    const label = generateSeatNumberLabel(5, 3, 4);
    expect(label).toBe('19');
    expect(label).toMatch(/^\d+$/);
    expect(isNumericSeatLabel(label)).toBe(true);
    expect(isNumericSeatLabel('A5')).toBe(false);
    expect(isNumericSeatLabel('B12')).toBe(false);
    expect(isNumericSeatLabel('A01')).toBe(false);
  });

  it('normalizes letter labels from the builder into numbers on create', async () => {
    const create = jest
      .fn<
        Promise<object>,
        [args: { data: { seats: { create: Array<{ label: string }> } } }]
      >()
      .mockResolvedValue({});
    const prisma = { seatTemplate: { create } } as never;
    const service = new SeatTemplatesService(prisma);

    await service.create('org-1', {
      name: 'باص 45',
      rows: 2,
      columnsPerRow: 4,
      aisleAfterColumn: 2,
      seats: [
        { row: 1, column: 1, label: 'A1', seatType: 'REGULAR' },
        { row: 1, column: 2, label: 'A2', seatType: 'REGULAR' },
        { row: 1, column: 3, label: 'B1', seatType: 'REGULAR' },
        { row: 1, column: 4, label: 'B2', seatType: 'REGULAR' },
        { row: 2, column: 1, label: 'A3', seatType: 'VIP' },
      ],
    } as never);

    const arg = create.mock.calls[0][0];
    expect(arg.data.seats.create.map((seat) => seat.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });

  it('generates full numeric template seats when none provided', async () => {
    const create = jest
      .fn<
        Promise<object>,
        [args: { data: { seats: { create: Array<{ label: string }> } } }]
      >()
      .mockResolvedValue({});
    const prisma = { seatTemplate: { create } } as never;
    const service = new SeatTemplatesService(prisma);

    await service.create('org-1', {
      name: 'حافلة VIP 2+2',
      rows: 2,
      columnsPerRow: 4,
      aisleAfterColumn: 2,
    });

    const arg = create.mock.calls[0][0];
    expect(arg.data.seats.create.map((s) => s.label)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
  });
});
