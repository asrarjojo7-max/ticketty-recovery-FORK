# Ticketty responsive UI contract

Arabic-first, RTL, calm solid blue/navy surfaces. Preserve tenant branding and physical ticket layouts independently from application UI.

## Shared dimensions

- Base spacing grid: 4px. Typical control gap: 8px; form gap: 16px; section gap: 24px.
- App page gutters: 16px phone, 20px tablet, 24px desktop. Shared content and header max-width: 90rem.
- Sidebar: 240px; top bar: 64px. Keep both shell offsets synchronized.
- Controls: 12px corner radius, minimum 44px phone height, 40px desktop height. Compact table actions: 36px desktop only.
- Cards/panels: 16px corner radius; content padding 16px phone / 20px larger screens. Avoid nesting several high-shadow panels.
- Icons: 16px in buttons, 20px in navigation and page titles. Icon tiles: 40px with 12px corners. Circles reserved for avatars, state indicators, progress, or meaningful charts.
- Page titles: 20px phone / 24px desktop; section titles: 16–18px; body: 14px; metadata: 12px. Keep the existing brand display font for headings, Cairo for body/controls, tabular figures for values.
- Inputs must use 16px text on mobile to avoid iOS focus zoom. Labels sit above inputs, not alongside long values on narrow screens.

## Layout rules

- Use shared Card, Button, Input, PageHeader, Tabs and DataTable rather than custom variants of the same control.
- Flex/grid children carrying text or fields need `min-w-0`. Long identifiers should wrap or scroll in a bounded region.
- Filters/actions stack at narrow widths; primary actions should not force a whole page wider than the viewport.
- Wide tables and seat maps scroll in their own container, never by clipping the entire body.
- Dialogs must fit the dynamic viewport and scroll internally. Preserve accessible labels, focus behavior, keyboard controls and close buttons.
- Match top-bar and main-content edges; avoid decorative offsets that look like accidental misalignment.
- No hover translation for working controls: hover should not move neighboring alignment.
- Prefer solid backgrounds and subtle borders over glows, giant ornamental circles and dense textures.

## Verification

`e2e/ui-audit.spec.ts` exercises initial route layouts at 320, 390, 768, 1024 and 1440px. It checks document overflow, heading/input/tab containment and login control alignment. Existing functional tests cover selling, reprinting, boarding, permissions and mobile navigation.

These geometry checks do not replace human visual review, screen-reader testing, long-data fixtures or printing-device validation. Screenshots may be collected, but visual approval must never be claimed if image contents are unavailable to the reviewer.
