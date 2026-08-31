import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const app = await readFile(new URL('../app.tsx', import.meta.url), 'utf8');

test('uses the Taskboard icon for the thread-header pin action', () => {
  const headerAction = app.match(
    /function TaskboardThreadHeaderAction[\s\S]*?\nfunction ProjectCredentialsInteractionForm/u
  )?.[0];
  assert.ok(headerAction, 'Missing TaskboardThreadHeaderAction implementation');
  assert.match(headerAction, /aria-label="Pin Taskboard on the right"/u);
  assert.match(headerAction, /<Icon name="Ticket" className="size-4" \/>/u);
  assert.doesNotMatch(headerAction, /<Icon name="PanelRight"/u);
});

test('shares durable project preferences between full and constrained surfaces', () => {
  assert.match(app, /useSyncExternalStore\(/u);
  assert.match(app, /browsePreferenceStore\.subscribe/u);
  assert.match(app, /projectBrowseScope\(projectId\)/u);
  assert.match(app, /surfaceMode=\{narrow \? 'constrained' : 'full'\}/u);
  assert.match(app, /surfaceMode="constrained"/u);
  assert.doesNotMatch(app, /right-panel:\$\{projectId\}/u);
  assert.match(app, /const \[committedQuery, setCommittedQuery\] = useState\(\(\) => query\.trim\(\)\)/u);
  assert.match(app, /updatePreferences\(current => \(\{ \.\.\.current, query: nextQuery \}\)\)/u);
  assert.doesNotMatch(app, /const \[query, setQuery\] = useState/u);
  assert.match(app, /maxLength=\{MAX_BROWSE_QUERY_LENGTH\}/u);
});

test('canonicalizes provider facet casing before rendering and persistence', () => {
  assert.match(app, /canonicalizeSelectedFilterOptions/u);
  assert.match(app, /isFilterOptionSelected/u);
  assert.match(app, /toggleFilterOptionSelection/u);
  assert.match(app, /sameStringValues\(current\.assignees, nextAssignees\)/u);
});

test('applies project presets through the released preference store', () => {
  assert.match(app, /useProjectFilterPresets\(projectId\)/u);
  assert.match(app, /useRealtime\('taskboard:presets-changed'/u);
  assert.match(app, /projectIdRef\.current !== projectId/u);
  assert.match(app, /loadedProjectId === projectId/u);
  assert.match(app, /projectId === null \? null : presetState\.presets/u);
  assert.match(app, /preset\.projectId !== projectId/u);
  assert.match(app, /preset\.state\.provider !== authoritativeProvider/u);
  assert.match(app, /browsePreferenceStore\.set\(preferenceScope, preset\.state\)/u);
  assert.doesNotMatch(app, /setCommittedQuery\(preset\.state\.query/u);
  assert.match(app, /state: preferences/u);
  assert.match(app, /Could not load presets:/u);
  assert.match(app, /Save current view as/u);
  assert.match(app, /mutationInFlightRef/u);
  assert.match(app, /value=\{nameDrafts\[preset\.id\] \?\? preset\.name\}/u);
});

test('keeps preset refreshes, drafts, and focus non-disruptive', () => {
  const hook = app.match(
    /function useProjectFilterPresets[\s\S]*?\nfunction loadRightPanelPinned/u
  )?.[0];
  assert.ok(hook, 'Missing project preset hook');
  assert.ok(
    [...hook.matchAll(/void reload\(\{ background: true \}\)/gu)].length >= 3,
    'Realtime, reconnect, and mutation reconciliation must stay in the background'
  );
  assert.match(hook, /if \(options\.background\) \{\s*setRefreshError\(message\)/u);
  assert.doesNotMatch(
    hook,
    /if \(options\.background\) \{[^}]*setPresets\(\[\]\)/u
  );
  assert.match(app, /Keeping your loaded presets and edits/u);
  assert.match(app, /authoritativeNamesRef/u);
  assert.match(app, /presetActionButtonRefs/u);
  assert.match(app, /restorePresetFocus\(preset\.id/u);
  assert.match(app, /flex min-w-0 flex-col gap-1\.5 @sm:flex-row/u);
  assert.match(app, /max-md:pointer-coarse:h-10 max-md:pointer-coarse:w-10/u);
});

test('announces preset apply and keeps save errors with the draft', () => {
  assert.match(app, /toast\.success\(`Applied preset/u);
  assert.match(app, /<DialogDescription id=\{presetSaveDescriptionId\}>/u);
  assert.match(app, /setPresetSaveError\(message\)/u);
  assert.match(app, /aria-invalid=\{presetSaveError !== null\}/u);
  assert.match(app, /id=\{presetSaveErrorId\}[\s\S]*?role="alert"/u);
});

test('keeps List measured and Kanban unconstrained', () => {
  assert.match(app, /data-taskboard-list-measure/u);
  assert.match(app, /max-w-\[56rem\]/u);
  assert.match(app, /data-taskboard-state-glyph/u);
  assert.doesNotMatch(app, /max-w-\[110rem\]/u);
  assert.match(app, /aria-expanded=\{!collapsed\}/u);
  const glyph = app.match(
    /function WorkStateGlyph[\s\S]*?\nfunction SidebarRow/u
  )?.[0];
  assert.ok(glyph, 'Missing WorkStateGlyph implementation');
  assert.doesNotMatch(glyph, /data-status-tone/u);
  assert.doesNotMatch(glyph, /workflowStatusTone/u);
  assert.match(app, /disabled=\{searchActive\}/u);
});

test('renders assignees as deterministic accessible avatars', () => {
  assert.match(app, /assigneeAvatarIdentity\(assignee\)/u);
  assert.match(app, /role="img"/u);
  assert.match(app, /aria-label=\{`Assigned to \$\{assignee\}`\}/u);
  assert.match(app, /data-assignee-tone=\{identity\.tone\}/u);
  assert.match(app, /<span aria-hidden="true">\{identity\.initials\}<\/span>/u);
});

test('uses an explicit constrained filter composition', () => {
  assert.match(app, /data-taskboard-filter-mode="constrained"/u);
  assert.match(app, /Search filter values/u);
  assert.match(app, /Filters\{activeFacetCount/u);
  assert.match(app, /active filter/u);
  assert.match(app, /--radix-dropdown-menu-content-available-height/u);
  assert.match(app, /min-h-0 flex-1 overflow-x-hidden overflow-y-auto/u);
  assert.match(app, /shrink-0 border-t border-border bg-popover/u);
  assert.match(app, /facetSearchRef/u);
  assert.match(app, /onOpenAutoFocus/u);
  assert.match(app, /event\.preventDefault\(\)/u);
  assert.match(app, /No matching values/u);
  assert.match(app, /data-taskboard-filter-values/u);
  assert.match(app, /overflow-x-hidden overflow-y-auto/u);
});

test('centralizes and reuses decorative filter icons across surfaces', () => {
  const filters = [
    'source',
    'state',
    'status',
    'assignee',
    'priority',
    'project',
    'labels'
  ];

  assert.match(app, /type FilterPresentationKey = 'source' \| WorkItemFilterField/u);
  assert.match(
    app,
    /satisfies Record<FilterPresentationKey, FilterPresentation>/u
  );
  assert.match(app, /BOARD_FILTER_FIELDS\.map\(field =>/u);
  assert.deepEqual(
    [...app.matchAll(/<FilterSectionLabel filter="([^"]+)"/gu)].map(
      match => match[1]
    ),
    filters
  );
  for (const filter of filters) {
    assert.match(
      app,
      new RegExp(`icon=\\{FILTER_PRESENTATION\\.${filter}\\.icon\\}`)
    );
    assert.match(
      app,
      new RegExp(`label=\\{FILTER_PRESENTATION\\.${filter}\\.label\\}`)
    );
  }
  assert.match(app, /name=\{presentation\.icon\}[\s\S]*?aria-hidden="true"/u);
  assert.match(app, /name=\{option\.icon\}[\s\S]*?aria-hidden="true"/u);
  assert.doesNotMatch(app, /<DropdownMenuLabel>(?:Source|State group|Status|Assignee|Priority|External project|Labels)<\/DropdownMenuLabel>/u);
});

test('supports direct and composer-assisted creation through one dialog', () => {
  assert.match(app, /mode: 'direct'/u);
  assert.match(app, /mode: 'composer-assisted'/u);
  assert.match(app, /mode="direct"/u);
  assert.match(app, /mode="composer-assisted"/u);
  assert.match(app, /getCreateIssueMetadata/u);
  assert.match(app, /loadedMetadataScope === currentMetadataScope/u);
  assert.match(app, /loadedConnectorRevision !== null/u);
  assert.match(app, /createOutcomeUncertain/u);
  assert.match(app, /CREATE_OUTCOME_UNCERTAIN_MARKER/u);
  assert.match(app, /restoreRememberedCreateAssignee/u);
  assert.match(app, /rememberCreateAssigneeAfterSuccess/u);
  assert.match(app, /assigneeConfirmation: AssigneeConfirmation/u);
  assert.match(app, /'New issue'/u);

  const createBody = app.match(
    /const create = async[\s\S]*?\n  const canSubmit/u
  )?.[0];
  assert.ok(createBody, 'Missing create submit implementation');
  const createCallIndex = createBody.indexOf("rpc.call('createIssue'");
  const rememberIndex = createBody.indexOf(
    'rememberCreateAssigneeAfterSuccess('
  );
  assert.ok(createCallIndex >= 0, 'Missing createIssue RPC call');
  assert.ok(rememberIndex >= 0, 'Missing success-bound remembered-assignee write');
  assert.ok(
    rememberIndex < createCallIndex,
    'The create RPC must be wrapped by the success-bound persistence helper'
  );
  assert.match(app, /!assisted \|\|\s*!draftRequestId/u);
  assert.match(app, /context\.projectName.*sourceName\(context\.source\).*New issue/su);
  assert.match(app, /Couldn&apos;t load creation options/u);
  assert.match(app, /role="alert"/u);
  assert.match(app, /aria-describedby=\{metadataError \? metadataErrorId/u);
  assert.match(app, /if \(!result\.ok\)/u);
  assert.match(app, /result\.error\.safeMessage/u);
  assert.match(app, /CREATE_METADATA_NETWORK_ERROR/u);
});

test('routes detail handoff through the external-content trust boundary', () => {
  assert.match(app, /const prompt = formatWorkItemHandoffPrompt\(item\)/u);
  assert.doesNotMatch(app, /const prompt = \[\s*`Work on \$\{sourceName/u);
});

test('renders comments as one conversation rail', () => {
  assert.match(app, /tb-comment-rail/u);
  assert.match(app, /tb-comment-entry/u);
  assert.doesNotMatch(app, /tb-comment-card rounded-lg border/u);
  assert.match(app, /activeItemRoute \? 'overflow-y-auto' : 'overflow-hidden'/u);
});

test('reconciles provider identity from the cached-list response', () => {
  assert.match(app, /const provider = result\.provider/u);
  assert.doesNotMatch(app, /rpc\.call\('status', \{ projectId \}\)/u);
});
