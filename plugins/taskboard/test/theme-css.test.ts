import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const stylesheet = await readFile(
  new URL('../app.css', import.meta.url),
  'utf8'
);

function ruleBody(pattern: RegExp, label: string): string {
  const match = stylesheet.match(pattern);
  assert.ok(match?.[1], `Missing ${label} rule`);
  return match[1];
}

test('keeps structural headers on neutral host theme surfaces', () => {
  const listHeader = ruleBody(
    /\.tb-group-heading,\s*\.tb-project-strip\s*\{([^}]*)\}/s,
    'list header'
  );
  const kanbanColumn = ruleBody(
    /\.tb-kanban-column\[data-state-category\]\s*\{([^}]*)\}/s,
    'Kanban column'
  );
  const kanbanHeader = ruleBody(
    /\.tb-kanban-column\[data-state-category\]\s+\.tb-kanban-column-header\s*\{([^}]*)\}/s,
    'Kanban header'
  );

  assert.match(
    listHeader,
    /background:\s*var\(--surface-recessed-soft-solid\)/
  );
  assert.doesNotMatch(listHeader, /--tb-state-accent/);
  assert.doesNotMatch(
    stylesheet,
    /\.tb-group-heading\[data-status-tone\]\s*\{/
  );

  for (const rule of [kanbanColumn, kanbanHeader]) {
    assert.match(
      rule,
      /background:\s*var\(--surface-recessed-soft-solid\)/
    );
    assert.doesNotMatch(rule, /--tb-state-accent/);
  }
  assert.match(kanbanColumn, /border-color:\s*var\(--tb-border\)/);
  assert.match(kanbanHeader, /box-shadow:[^;]*var\(--tb-border\)/s);
});

test('uses restrained state glyph, focus, and conversation treatments', () => {
  const stateGlyph = ruleBody(
    /\.tb-state-glyph\s*\{([^}]*)\}/s,
    'state glyph'
  );
  const commentRail = ruleBody(
    /\.tb-comment-rail\s*>\s*div\s*\{([^}]*)\}/s,
    'comment rail'
  );

  assert.match(stateGlyph, /color:\s*var\(--tb-state-accent\)/u);
  assert.match(commentRail, /box-shadow:\s*inset 1px 0 0/u);
  assert.match(stylesheet, /\.tb-item-row:hover,\s*\.tb-item-row:focus-within/u);
  assert.doesNotMatch(
    stylesheet,
    /\.tb-group-heading\[data-state-category\][^{]*\{[^}]*inset 2px/u
  );
  assert.match(stylesheet, /\.tb-comment-entry::before/u);
  assert.match(stylesheet, /\.tb-search-shell:focus-within/u);
});

test('keeps constrained filter values inside the vertical menu measure', () => {
  const filterValues = ruleBody(
    /\[data-taskboard-filter-values\] \[role='menuitemcheckbox'\]\s*\{([^}]*)\}/s,
    'constrained filter values'
  );

  assert.match(filterValues, /min-width:\s*0/u);
  assert.match(filterValues, /white-space:\s*normal/u);
  assert.match(filterValues, /overflow-wrap:\s*anywhere/u);
});

test('keeps assignee avatars compact with six theme-safe identity tones', () => {
  const avatar = ruleBody(
    /\.tb-assignee-mark\s*\{([^}]*)\}/s,
    'assignee avatar'
  );

  assert.match(avatar, /inline-size:\s*20px/u);
  assert.match(avatar, /block-size:\s*20px/u);
  assert.match(avatar, /box-sizing:\s*border-box/u);
  assert.match(avatar, /min-inline-size:\s*20px/u);
  assert.match(avatar, /min-block-size:\s*20px/u);
  assert.match(avatar, /max-inline-size:\s*20px/u);
  assert.match(avatar, /max-block-size:\s*20px/u);
  assert.match(avatar, /flex:\s*0 0 20px/u);
  assert.match(avatar, /font-size:\s*9px/u);
  assert.match(avatar, /font-weight:\s*700/u);
  assert.match(avatar, /color-mix\(in oklch/u);
  assert.match(avatar, /radial-gradient/u);
  for (const tone of ['violet', 'blue', 'teal', 'amber', 'rose', 'slate']) {
    assert.match(
      stylesheet,
      new RegExp(`\\.tb-assignee-mark\\[data-assignee-tone='${tone}'\\]`)
    );
  }
  assert.match(
    stylesheet,
    /@container \(max-width: 36rem\)[\s\S]*?\.tb-item-row \.tb-assignee-mark\s*\{\s*display:\s*none;/u
  );
});

test('shows restrained composer drop feedback and discoverable drag grips', () => {
  const dropTarget = ruleBody(
    /form\[data-taskboard-composer-drop-target='active'\]\s*\{([^}]*)\}/s,
    'composer drop target'
  );
  const cue = ruleBody(/\.tb-composer-drop-cue\s*\{([^}]*)\}/s, 'drop cue');

  assert.match(dropTarget, /outline:\s*2px dashed var\(--input\)/u);
  assert.match(cue, /pointer-events:\s*none/u);
  assert.match(cue, /background:\s*var\(--canvas\)/u);
  assert.match(cue, /color:\s*var\(--ink\)/u);
  assert.match(stylesheet, /\.tb-composer-drag-grip/u);
  assert.match(
    stylesheet,
    /\.tb-item-row\[data-composer-drag='true'\][\s\S]*?grid-template-columns/u
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tb-composer-drag-grip/u
  );
});
