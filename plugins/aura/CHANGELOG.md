# Changelog

## 0.2.5 - 2026-10-30

- Keep pixel dithering continuous when the panel size is not a multiple of four
  pixels instead of splitting the canvas into four threshold quadrants.

## 0.2.4

- Fix settings failing to load with `Unrecognized key: "activityOverview"` when
  data written by this build is read by the older published 0.2.3 release.
  Stored settings now ignore unknown keys instead of rejecting the snapshot.
- Add a default-off GitHub activity overview inside AURA, using authenticated
  dated contributions and actual PR/review counts with explicit source limits.
- Preserve native composer centering with wallpaper/overview disabled and make
  the compact New thread layout scrollable with the overview below the composer.
- Keep overview settings global across background slots and resets; add
  `bb aura overview on|off`. Preserve installed animation speed/quality controls.
- Accept animated GIF backgrounds up to 8 MB, stored as uploaded. Capy dithering
  plays them frame by frame with their own frame timing.
- Add texture choices: seven patterns for the image-free effect, five motions for
  photo dithering (including Still), and four dither styles. Existing backgrounds
  and saved slots keep their current look.

## 0.2.3

- Add 15, 30, and 60 FPS animation-speed controls.
- Add Performance, Balanced, and Sharp WebGL render-quality controls.
- Preserve conservative defaults for existing backgrounds and saved slots.

## 0.2.2

- Add theme-aware reading surfaces to New thread controls and recent threads.
- Cache immutable versioned background images privately for one year.
- Reduce animated dither rendering to 15 FPS and one-third resolution.
- Cache WebGL uniform locations instead of resolving them every frame.

## 0.2.1

- Extend chat wallpapers to the bottom of the pane, including beside the composer.
- Keep half/full wallpaper selection in Aura settings; remove the composer toggle.
- Fade half wallpapers out at the midpoint of New thread; keep chats full-height.
- Restore the correct background when BB reuses panels during navigation.
- Keep wide tables readable beyond the message column, with horizontal scrolling.
- Preserve saved images, slots, dimming preference and scope across reloads.
