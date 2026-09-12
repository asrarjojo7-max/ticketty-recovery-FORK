import { BadRequestException } from '@nestjs/common';
import {
  canGrantPermissions,
  contrastWithWhite,
  detectTicketBrandImageMime,
  ticketBrandAssetKind,
} from './administration.service';

describe('administration permission grant ceiling', () => {
  it('allows an owner wildcard to grant any permission', () => {
    expect(
      canGrantPermissions(['*'], ['settings.write', 'payments.read']),
    ).toBe(true);
  });

  it('allows exact, domain wildcard, and narrower own permissions', () => {
    expect(
      canGrantPermissions(
        ['bookings.write', 'payments.*'],
        ['bookings.write.own', 'payments.read'],
      ),
    ).toBe(true);
  });

  it('rejects global wildcard and permissions outside the actor ceiling', () => {
    expect(canGrantPermissions(['settings.write'], ['*'])).toBe(false);
    expect(canGrantPermissions(['settings.write'], ['payments.write'])).toBe(
      false,
    );
  });
});

describe('ticket branding asset validation', () => {
  it('detects supported image signatures without trusting extensions', () => {
    expect(
      detectTicketBrandImageMime(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      ),
    ).toBe('image/png');
    expect(
      detectTicketBrandImageMime(
        Buffer.from([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
    expect(detectTicketBrandImageMime(Buffer.from([0xff, 0xd8, 0xff]))).toBe(
      'image/jpeg',
    );
  });

  it('rejects SVG/text and unknown asset kinds', () => {
    expect(detectTicketBrandImageMime(Buffer.from('<svg></svg>'))).toBeNull();
    expect(() => ticketBrandAssetKind('avatar')).toThrow(BadRequestException);
  });

  it('calculates WCAG contrast for customizable ticket colors', () => {
    expect(contrastWithWhite('#07558C')).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite('#FFFFFF')).toBe(1);
  });
});
