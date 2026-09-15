import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const css = readFileSync(resolve(root, 'themes/lavender.css'), 'utf8');
const modes = [...css.matchAll(/(?:\.light|\.dark)\s*\{([^}]+)\}/g)].map((match) => Object.fromEntries([...match[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map((m) => [m[1], m[2]])));
function luminance(hex) { const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; }
function contrast(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
for (const [index, colors] of modes.entries()) {
  test(`${index ? 'dark' : 'light'} text remains readable across content, panels, composer and selection`, () => {
    for (const fg of ['ink','muted-foreground','subtle-foreground','readback-foreground']) for(const bg of ['canvas','card','sidebar','secondary','sidebar-accent']) assert.ok(contrast(colors[fg],colors[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(colors[fg],colors[bg]).toFixed(2)}`);
    for (const [fg,bg] of [['primary-foreground','primary'],['destructive-foreground','destructive']]) assert.ok(contrast(colors[fg],colors[bg]) >= 4.5, `${fg} on ${bg}`);
    for(const fg of ['primary','destructive-text','warning-text','success','file-accent']) assert.ok(contrast(colors[fg],colors.canvas)>=4.5, fg);
  });
}
test('the distributable exposes one paired palette with local readable syntax assets', () => {
  assert.equal(modes.length,2);
  assert.equal(manifest.bb.themes.length,1);
  const theme=manifest.bb.themes[0];
  for(const path of [theme.css,theme.codeTheme.light,theme.codeTheme.dark,manifest.bb.branding.icon,manifest.bb.server]) {
    const rel=relative(root,resolve(root,path)); assert.ok(!rel.startsWith('..')&&!isAbsolute(rel)); assert.ok(existsSync(resolve(root,path)));
  }
  for(const [index,mode] of ['light','dark'].entries()) {
    const syntax=JSON.parse(readFileSync(resolve(root,theme.codeTheme[mode]),'utf8'));
    assert.equal(syntax.type,mode); assert.equal(syntax.colors['editor.background'],modes[index].card);
    for(const rule of syntax.tokenColors) assert.ok(contrast(rule.settings.foreground,syntax.colors['editor.background']) >= 4.5, `${mode} ${rule.scope}`);
  }
  assert.doesNotMatch(css, /@import|url\(|!important/);
});
