# Decisions: Aura Mobile Recent List Surface

## D-001: One themed card around the mobile Recent list

Status: Accepted

### Evidence

- Real-browser inspection at 390x844 (Aura 0.2.7) showed the Recent section
  (`[data-root-compose-mobile-recents]`) sitting directly on the wallpaper with
  a sticky header painted `var(--background)` (an opaque band) and transparent
  rows, so titles floated on the dithering texture.
- The section is `md:hidden`, so the desktop-media recents chrome already in
  `lib/background.ts` (padding, border, radius, surface, shadow, heading rule)
  never applied anywhere. It was the intended design for this element.
- The composer is already a card on the same screen; a second deliberate surface
  for the list keeps them related without merging the two.

### Options

1. Wrap the list in one themed card, move the stranded recents chrome from the
   desktop block to a mobile-only block, and make the heading non-sticky.
2. Keep the native full-width list and only make rows translucent cards.
3. Hide the Recent list on mobile entirely.

### Chosen approach

Option 1. It reuses the design Aura already shipped for this element, keeps the
wallpaper visible above and around the card, and removes the opaque header band
without inventing a new visual language.

### Trade-offs and risks

The card hides the wallpaper behind the list, so it is inset and only covers the
list area; the top of the screen keeps the wallpaper. The host's row markup can
change; styles target the stable data attribute and structural children, and the
browser check measures computed card properties. Making the heading non-sticky
means it scrolls away with the list, which is the normal behavior for a section
heading and avoids an overlay band.

### Verification

Unit test asserts the recents card rules live only in a `max-width: 767px`
block. Real-browser checks at 390x844 in light and dark assert the card radius,
background, border, the heading rule, row dividers, and no horizontal overflow,
with screenshots; 1440x1000 confirms the mobile recents element is hidden and
the composer stays centered.
