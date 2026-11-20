import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const css = readFileSync(resolve(root, 'themes/ghostrunner.css'), 'utf8');
const modes = ['light', 'dark'];
const palettes = Object.fromEntries(modes.map((mode) => {
  const selector = mode === 'dark' ? ':root\\.dark' : ':root';
  const palette = css.match(new RegExp(`^${selector} \\{([^}]*--canvas:[^}]*)\\}`, 'm'))?.[1];
  assert.ok(palette, `Missing ${mode} palette`);
  const colors = [...palette.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)];
  return [mode, Object.fromEntries(colors.map(([, token, color]) => [token, color]))];
}));

function luminance(hex) {
  const rgb = hex.slice(1, 7).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('Ghostrunner has light and dark canvases', () => {
  assert.ok(luminance(palettes.light.canvas) > 0.8);
  assert.ok(luminance(palettes.dark.canvas) < 0.1);
  assert.deepEqual(Object.keys(palettes.light), Object.keys(palettes.dark));
});

for (const [mode, colors] of Object.entries(palettes)) {
  test(`${mode} text stays readable on content, panels, composer and selection`, () => {
    for (const fg of ['ink', 'muted-foreground', 'subtle-foreground', 'readback-foreground'])
      for (const bg of ['canvas', 'card', 'sidebar', 'secondary', 'sidebar-accent'])
        assert.ok(contrast(colors[fg], colors[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(colors[fg], colors[bg]).toFixed(2)}`);
    for (const [fg, bg] of [['primary-foreground', 'primary'], ['destructive-foreground', 'destructive']])
      assert.ok(contrast(colors[fg], colors[bg]) >= 4.5, `${fg} on ${bg}`);
    for (const fg of ['primary', 'destructive-text', 'warning-text', 'success', 'file-accent'])
      assert.ok(contrast(colors[fg], colors.canvas) >= 4.5, fg);
  });
}

test('the manifest ships one theme with local, readable syntax colours', () => {
  assert.equal(manifest.bb.themes.length, 1);
  const theme = manifest.bb.themes[0];
  for (const path of [theme.css, theme.codeTheme.light, theme.codeTheme.dark, manifest.bb.branding.icon, manifest.bb.server]) {
    const rel = relative(root, resolve(root, path));
    assert.ok(!rel.startsWith('..') && !isAbsolute(rel), path);
    assert.ok(existsSync(resolve(root, path)), path);
  }
  for (const mode of modes) {
    const syntax = JSON.parse(readFileSync(resolve(root, theme.codeTheme[mode]), 'utf8'));
    assert.equal(syntax.type, mode);
    assert.equal(syntax.colors['editor.background'], palettes[mode].card);
    for (const rule of syntax.tokenColors)
      assert.ok(contrast(rule.settings.foreground, syntax.colors['editor.background']) >= 4.5, `${mode}: ${rule.scope}`);
  }
  assert.doesNotMatch(css, /@import|url\(|!important/);
});
