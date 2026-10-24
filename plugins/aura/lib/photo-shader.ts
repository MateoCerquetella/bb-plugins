import { IMAGE_DITHERING_SHADER } from "./capy-shaders.ts";
import { DITHERS, PATTERNS, PHOTO_MOTIONS, type BackgroundSettings } from "./model.ts";

// Capy's photo shader is static. Aura adds a slow spatial threshold motion so
// the photo's dither texture moves without moving the photo itself. Keep the
// attributed upstream source intact in capy-shaders.ts.
export const ANIMATED_PHOTO_SHADER = IMAGE_DITHERING_SHADER
  .replace("uniform vec2 u_resolution;", "uniform float u_time;\nuniform float u_motion;\nuniform vec2 u_resolution;")
  .replace(
    "float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);",
    `float auraWave = 0.0;
  if (u_motion < 0.5) {
    auraWave = sin(u_time * 1.4 + normalizedUV.x * 12.0 + sin(normalizedUV.y * 9.0)) * 0.07;
  } else if (u_motion < 1.5) {
    auraWave = sin(length(normalizedUV - 0.5) * 30.0 - u_time * 2.2) * 0.07;
  } else if (u_motion < 2.5) {
    auraWave = sin((normalizedUV.x * 0.7 + normalizedUV.y) * 7.0 - u_time * 0.8) * 0.07;
  } else if (u_motion < 3.5) {
    auraWave = (hash21(floor(pxSizeUV) + floor(u_time * 6.0)) - 0.5) * 0.12;
  }
  float brightness = clamp(lum + dithering / colorSteps + auraWave, 0.0, 1.0);`,
  );

/** Uniform values selecting the shader branch for each texture setting. */
export function patternUniforms(settings: BackgroundSettings): { u_shape: number; u_type: number; u_motion: number } {
  return {
    u_shape: PATTERNS.indexOf(settings.pattern) + 1,
    u_type: DITHERS.indexOf(settings.dither) + 1,
    u_motion: PHOTO_MOTIONS.indexOf(settings.photoMotion),
  };
}
