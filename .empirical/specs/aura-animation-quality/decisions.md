# Decisions: Aura Animation Quality

## D-001: Parameterize the existing shader loop

Status: Accepted

### Evidence

Aura already centralizes frame scheduling and canvas sizing in
`plugins/aura/lib/capy-effect.ts`; settings are validated and persisted through
the existing RPC and slot tables.

### Options

- Add controls that only change CSS animation timing.
- Parameterize the existing WebGL scheduler and drawing-buffer sizing.
- Replace the shader with a new rendering library.

### Chosen approach

Parameterize the existing scheduler and buffer sizing. This keeps visual output
and failure guards stable while making the expensive work explicit.

### Trade-offs and risks

Higher FPS and Sharp quality can increase GPU use; conservative defaults and a
hard framebuffer cap mitigate that cost. Quality changes recreate WebGL state,
so disposal remains mandatory.

### Verification

Focused tests inspect selected timing and quality values; browser checks verify
the controls and live preview; build/type checks confirm the SDK contract.

## D-002: Use enum quality tiers, not arbitrary scale input

Status: Accepted

### Evidence

The request asks for better image quality, but arbitrary numeric scaling would
make GPU cost unpredictable and complicate narrow settings-panel UI.

### Options

- Free-form numeric slider.
- Three named, bounded quality tiers.
- A single “high quality” toggle.

### Chosen approach

Three named tiers: Performance, Balanced, and Sharp. Each maps to a fixed scale
and retains the existing image framebuffer cap.

### Trade-offs and risks

Users cannot tune an exact scale, but the controls are easier to understand,
persist, test, and keep within safe resource bounds.

### Verification

Schema, shader, and UI tests cover all three values and legacy default loading.
