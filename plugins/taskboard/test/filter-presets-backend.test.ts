import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PLUGIN_CLI_OUTPUT_MAX_BYTES } from '@get-bb/plugin-sdk';
import Database from 'better-sqlite3';
import {
  defaultBrowsePreferences,
  type BrowsePreferences
} from '../browse-preferences.ts';
import {
  FILTER_PRESET_PROJECT_STATE_BYTES_MAX,
  FILTER_PRESET_STATE_JSON_MAX_LENGTH,
  filterPresetSummary,
  serializeFilterPresetState
} from '../filter-presets.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && specifier.endsWith('.js')) {
      const sourceUrl = new URL(
        `${specifier.slice(0, -'.js'.length)}.ts`,
        context.parentURL
      );
      if (existsSync(fileURLToPath(sourceUrl))) {
        return { shortCircuit: true, url: sourceUrl.href };
      }
    }
    return nextResolve(specifier, context);
  }
});

const { createWorkItemStore } = await import('../store.ts');
const {
  formatFilterPresetCliJson,
  parseTaskboardCliArguments,
  resolvePresetListSelection
} = await import('../server.ts');
type StoreBb = Parameters<typeof createWorkItemStore>[0];
type WorkItemStore = ReturnType<typeof createWorkItemStore>;

function createStore(): { db: Database.Database; store: WorkItemStore } {
  const db = new Database(':memory:');
  const bb = {
    storage: {
      database: () => db,
      migrate(database: Database.Database, migrations: readonly string[]) {
        for (const migration of migrations) database.exec(migration);
      }
    }
  } as unknown as StoreBb;
  return { db, store: createWorkItemStore(bb) };
}

test('upgrades a retained Work-board migration without rewriting history or losing data', () => {
  const db = new Database(':memory:');
  const hash = (sql: string) => createHash('sha256').update(sql).digest('hex');
  let statements: readonly string[] = [];
  const bb = { storage: {
    database: () => db,
    migrate(database: Database.Database, migrations: readonly string[]) {
      statements = migrations;
      database.exec('CREATE TABLE IF NOT EXISTS _bb_migrations (id INTEGER PRIMARY KEY, statement_hash TEXT)');
      database.transaction(() => migrations.forEach((sql, index) => {
        const existing = database.prepare('SELECT statement_hash FROM _bb_migrations WHERE id=?').get(index) as { statement_hash: string } | undefined;
        if (existing) assert.equal(hash(sql), existing.statement_hash, `migration ${index}`);
        else {
          database.exec(sql);
          database.prepare('INSERT INTO _bb_migrations VALUES (?,?)').run(index, hash(sql));
        }
      }))();
    }
  }} as unknown as StoreBb;
  try {
    // Capture the canonical migrations without using an external checkout.
    createWorkItemStore({ storage: {
      database: () => db,
      migrate(database: Database.Database, migrations: readonly string[]) {
        statements = migrations;
        migrations.slice(0, 7).forEach(sql => database.exec(sql));
        throw new Error('legacy schema prepared');
      }
    }} as unknown as StoreBb);
  } catch (error) {
    assert.equal((error as Error).message, 'legacy schema prepared');
  }
  try {
    db.exec('CREATE TABLE _bb_migrations (id INTEGER PRIMARY KEY, statement_hash TEXT)');
    statements.slice(0, 7).forEach((sql, index) => db.prepare('INSERT INTO _bb_migrations VALUES (?,?)').run(index, hash(sql)));
    db.prepare('INSERT INTO _bb_migrations VALUES (7,?)').run('2ed0e2eda3103f718fe67e4f50324116a3dfddcd1959b05959e083a2cc80e1ca');
    db.exec("CREATE TABLE work_board_settings (project_id TEXT PRIMARY KEY, data_json TEXT); INSERT INTO work_board_settings VALUES ('proj_legacy','preserved')");
    db.exec("CREATE TABLE preparations (document TEXT); INSERT INTO preparations VALUES ('preserved')");
    createWorkItemStore(bb);
    assert.equal(db.prepare('SELECT data_json FROM work_board_settings').pluck().get(), 'preserved');
    assert.equal(db.prepare('SELECT document FROM preparations').pluck().get(), 'preserved');
    assert.equal(db.prepare('SELECT count(*) FROM _bb_migrations').pluck().get(), 12);
    createWorkItemStore(bb);
  } finally {
    db.close();
  }
});

function state(provider: 'github' | 'linear' = 'github'): BrowsePreferences {
  return {
    ...defaultBrowsePreferences({ provider }),
    query: 'security',
    view: 'kanban' as const,
    stateCategories: ['in_progress' as const],
    statuses: ['Review'],
    assignees: ['Mateo'],
    priorities: ['High'],
    externalProjects: ['Taskboard'],
    labels: ['backend'],
    collapsedGroups: { done: false }
  };
}

function maximumUtf8State(): BrowsePreferences {
  const values = Array.from({ length: 100 }, (_, index) =>
    `${'界'.repeat(497)}${String(index).padStart(3, '0')}`
  );
  return {
    ...state(),
    source: 'github' as const,
    query: '界'.repeat(500),
    stateCategories: [
      'backlog',
      'todo',
      'in_progress',
      'done',
      'canceled'
    ],
    statuses: values,
    assignees: values,
    priorities: values,
    externalProjects: values,
    labels: values,
    collapsedGroups: Object.fromEntries(values.map(value => [value, true]))
  };
}

test('appends only the preset migration and round-trips complete state', () => {
  const { db, store } = createStore();
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => (row as { name: string }).name);
    assert.ok(tables.includes('project_filter_presets'));
    assert.equal(tables.includes('project_filter_state'), false);
    const tableSql = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project_filter_presets'"
      )
      .get() as { sql: string };
    assert.match(tableSql.sql, /id TEXT NOT NULL PRIMARY KEY/u);
    assert.match(tableSql.sql, /910000/u);

    const saved = store.saveFilterPreset({
      projectId: 'proj_alpha',
      name: 'My work',
      state: state()
    });
    assert.deepEqual(store.listFilterPresets('proj_alpha'), [saved]);
    assert.deepEqual(saved.state, state());
  } finally {
    db.close();
  }
});

test('isolates names and ids between projects', () => {
  const { db, store } = createStore();
  try {
    const alpha = store.saveFilterPreset({
      projectId: 'proj_alpha',
      name: 'My Work',
      state: state()
    });
    const beta = store.saveFilterPreset({
      projectId: 'proj_beta',
      name: 'my work',
      state: state()
    });

    assert.throws(() =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name: 'MY WORK',
        state: state()
      })
    );
    assert.throws(() =>
      store.saveFilterPreset({
        projectId: 'proj_beta',
        id: alpha.id,
        name: 'Moved',
        state: state()
      })
    );
    assert.deepEqual(
      store.deleteFilterPreset('proj_beta', alpha.id).map(item => item.id),
      [beta.id]
    );
    assert.equal(store.listFilterPresets('proj_alpha')[0]?.id, alpha.id);
  } finally {
    db.close();
  }
});

test('contains corrupt rows and makes reorder exact and atomic', () => {
  const { db, store } = createStore();
  try {
    const presets = ['One', 'Two', 'Three'].map(name =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name,
        state: state()
      })
    );
    db.prepare(
      `INSERT INTO project_filter_presets (
         id, bb_project_id, name, name_normalized, filters_json, position,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fp_corrupt',
      'proj_alpha',
      'Corrupt',
      'corrupt',
      '{}',
      3,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
    const serializedState = serializeFilterPresetState(state());
    db.prepare(
      `INSERT INTO project_filter_presets (
         id, bb_project_id, name, name_normalized, filters_json, position,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fp_trimmed ',
      'proj_alpha',
      'Trimmed ',
      'trimmed',
      serializedState,
      4,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO project_filter_presets (
         id, bb_project_id, name, name_normalized, filters_json, position,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fp_bad_normalized',
      'proj_alpha',
      'Canonical',
      'not-canonical',
      serializedState,
      5,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );
    db.prepare(
      `INSERT INTO project_filter_presets (
         id, bb_project_id, name, name_normalized, filters_json, position,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fp_expanded_name',
      'proj_alpha',
      '\ufdfa'.repeat(14),
      'expanded-name',
      serializedState,
      6,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z'
    );

    assert.deepEqual(
      store.listFilterPresets('proj_alpha').map(item => item.name),
      ['One', 'Two', 'Three']
    );
    const requested = [presets[2]!.id, presets[0]!.id, presets[1]!.id];
    assert.deepEqual(
      store.reorderFilterPresets('proj_alpha', requested).map(item => item.id),
      requested
    );

    const before = db
      .prepare(
        `SELECT id, position, updated_at
         FROM project_filter_presets
         WHERE bb_project_id = ?
         ORDER BY id`
      )
      .all('proj_alpha');
    assert.throws(() =>
      store.reorderFilterPresets('proj_alpha', requested.slice(1))
    );
    assert.deepEqual(
      db.prepare(
        `SELECT id, position, updated_at
         FROM project_filter_presets
         WHERE bb_project_id = ?
         ORDER BY id`
      ).all('proj_alpha'),
      before
    );

    db.prepare(
      `UPDATE project_filter_presets
       SET position = position + 10
       WHERE bb_project_id = ?`
    ).run('proj_alpha');
    const gapped = db
      .prepare(
        `SELECT id, position, updated_at
         FROM project_filter_presets
         WHERE bb_project_id = ?
         ORDER BY id`
      )
      .all('proj_alpha');
    store.deleteFilterPreset('proj_alpha', 'fp_absent');
    assert.deepEqual(
      db.prepare(
        `SELECT id, position, updated_at
         FROM project_filter_presets
         WHERE bb_project_id = ?
         ORDER BY id`
      ).all('proj_alpha'),
      gapped
    );
  } finally {
    db.close();
  }
});

test('enforces the per-project preset limit without blocking updates', () => {
  const { db, store } = createStore();
  try {
    const saved = Array.from({ length: 50 }, (_, index) =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name: `Preset ${index}`,
        state: state()
      })
    );
    assert.throws(() =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name: 'One too many',
        state: state()
      })
    );
    assert.equal(store.listFilterPresets('proj_alpha').length, 50);
    const renamed = store.saveFilterPreset({
      projectId: 'proj_alpha',
      id: saved[0]!.id,
      name: 'Renamed at capacity',
      state: saved[0]!.state
    });
    assert.equal(renamed.name, 'Renamed at capacity');
  } finally {
    db.close();
  }
});

test('bounds reads and fails closed when raw rows exceed the preset limit', () => {
  const { db, store } = createStore();
  try {
    Array.from({ length: 50 }, (_, index) =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name: `Preset ${index}`,
        state: state()
      })
    );
    db.prepare(
      `INSERT INTO project_filter_presets (
         id, bb_project_id, name, name_normalized, filters_json, position,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'fp_overflow',
      'proj_alpha',
      'Overflow',
      'overflow',
      '{}',
      0,
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z'
    );

    const visible = store.listFilterPresets('proj_alpha');
    assert.equal(visible.length, 50);
    assert.throws(() =>
      store.reorderFilterPresets(
        'proj_alpha',
        visible.map(preset => preset.id)
      )
    );
    assert.throws(() =>
      store.saveFilterPreset({
        projectId: 'proj_alpha',
        name: 'Blocked by overflow',
        state: state()
      })
    );
  } finally {
    db.close();
  }
});

test('rejects --from-state on wrong verbs and preserves explicit precedence', () => {
  assert.throws(() =>
    parseTaskboardCliArguments('presets', [
      'list',
      '--from-state',
      '{}'
    ])
  );
  assert.equal(
    parseTaskboardCliArguments('presets', [
      'save',
      'Mine',
      '--from-state',
      '{}'
    ]).fromState,
    '{}'
  );
  assert.equal(
    parseTaskboardCliArguments('list', ['--query', '']).query,
    ''
  );

  const preset = {
    id: 'fp_1',
    projectId: 'proj_alpha',
    name: 'Mine',
    state: { ...state('linear'), source: 'linear' as const },
    position: 0
  };
  const selection = resolvePresetListSelection(
    preset,
    'github',
    '',
    ['state', 'status', 'assignee', 'priority', 'project', 'labels']
  );
  assert.equal(selection.source, 'github');
  assert.equal(selection.query, '');
  assert.deepEqual(selection.attributeFilters, {
    statuses: ['Review'],
    assignees: ['Mateo'],
    priorities: ['High'],
    projects: ['Taskboard'],
    labels: ['backend']
  });

  const disabled = resolvePresetListSelection(
    preset,
    undefined,
    undefined,
    ['assignee']
  );
  assert.deepEqual(disabled.stateCategories, []);
  assert.deepEqual(disabled.attributeFilters, {
    statuses: [],
    assignees: ['Mateo'],
    priorities: [],
    projects: [],
    labels: []
  });
});

test('keeps maximum aggregate preset JSON compact and under the CLI cap', () => {
  const nearMaxState = maximumUtf8State();
  const nearMaxSerialized = serializeFilterPresetState(nearMaxState);
  assert.ok(new TextEncoder().encode(nearMaxSerialized).byteLength > 890_000);

  const presets = [{
    id: 'fp_max',
    projectId: `proj_${'p'.repeat(495)}`,
    name: 'Maximum state',
    state: nearMaxState,
    position: 0
  }];
  const output = formatFilterPresetCliJson({ presets });
  const outputBytes = new TextEncoder().encode(output).byteLength;
  assert.ok(outputBytes > 700_000);
  assert.ok(outputBytes <= PLUGIN_CLI_OUTPUT_MAX_BYTES);
  assert.equal(output.includes('\n'), false);
  const saveOutput = formatFilterPresetCliJson({
    preset: filterPresetSummary(presets[0]!),
    presets
  });
  assert.ok(
    new TextEncoder().encode(saveOutput).byteLength <=
      PLUGIN_CLI_OUTPUT_MAX_BYTES
  );
  assert.equal('state' in filterPresetSummary(presets[0]!), false);
  assert.throws(() =>
    formatFilterPresetCliJson({
      value: 'x'.repeat(PLUGIN_CLI_OUTPUT_MAX_BYTES + 1)
    })
  );
});

test('enforces a transactional aggregate state-byte limit per project', () => {
  const { db, store } = createStore();
  try {
    const maximum = maximumUtf8State();
    const maximumBytes = new TextEncoder().encode(
      serializeFilterPresetState(maximum)
    ).byteLength;
    assert.ok(maximumBytes <= FILTER_PRESET_STATE_JSON_MAX_LENGTH);
    assert.ok(maximumBytes < FILTER_PRESET_PROJECT_STATE_BYTES_MAX);

    const saved = store.saveFilterPreset({
      projectId: 'proj_aggregate',
      name: 'Maximum',
      state: maximum
    });
    const medium = {
      ...state(),
      labels: Array.from({ length: 100 }, (_, index) =>
        `${String(index).padStart(3, '0')}${'x'.repeat(497)}`
      )
    };
    assert.throws(() =>
      store.saveFilterPreset({
        projectId: 'proj_aggregate',
        name: 'Too much aggregate state',
        state: medium
      })
    );
    assert.equal(store.listFilterPresets('proj_aggregate').length, 1);

    const renamed = store.saveFilterPreset({
      projectId: 'proj_aggregate',
      id: saved.id,
      name: 'Maximum renamed',
      state: maximum
    });
    assert.equal(renamed.name, 'Maximum renamed');
  } finally {
    db.close();
  }
});
