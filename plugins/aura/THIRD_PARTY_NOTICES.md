# Background effect provenance

Capy’s background treatment is adapted with permission reported by the
contributor. The source was retrieved from https://capy.ai/new on 2026-09-08:

- https://capy.ai/assets/bounded-dithering-CsxWlFZG.js
- https://capy.ai/assets/new-D4WvqOy9.js

`lib/capy-shaders.ts` contains the vertex, dithering, and image-dithering GLSL
from those bundles, with template constants expanded. The GLSL is unchanged.
The bounded rendering settings, two radial masks, center blur, bottom fades,
blend modes, and animation values in `lib/capy-effect.ts` come from that page.
The BB lifecycle adapter and settings wiring are new.

The shader implementation is Paper Shaders by Paper Design, licensed under the
Apache License, Version 2.0. A copy is included at
`licenses/PAPER-SHADERS-APACHE-2.0.txt`.
Upstream: https://github.com/paper-design/shaders
License source: https://github.com/paper-design/shaders/blob/main/LICENSE

The site's unrelated application code, authentication, analytics, and product
assets are not included. No requests to Capy are made when the plugin runs.

Aura's `lib/photo-shader.ts` derives an animated variant of the image shader by
adding a time uniform and a slow spatial wave to its dither threshold. The
attributed upstream shader text in `capy-shaders.ts` remains unchanged.
