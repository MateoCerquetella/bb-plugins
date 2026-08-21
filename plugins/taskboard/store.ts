import { randomUUID } from 'node:crypto';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import {
  bbProjectIdSchema,
  boardFilterStateSchema,
  defaultProjectBoardSettings,
  filterPresetNameSchema,
  filterPresetSchema,
  normalizeBoardFilterState,
  normalizePresetName,
  projectBoardSettingsSchema,
  projectSourceConfigSchema,
  resolvePresetOrder,
  workItemSchema,
  type BoardFilterState,
  type FilterPreset,
  type ProjectBoardSettings,
  type ProjectSourceConfig,
  type WorkItem,
  type WorkSource,
  type WorkStateCategory
} from './contract.js';

type PluginDatabase = ReturnType<BbPluginApi['storage']['database']>;
type SqlParameter = string | number | null;

interface WorkItemRow {
  bb_project_id: string;
  source: string;
  locator: string;
  item_key: string;
  title: string;
  description: string;
  url: string;
  status: string;
  state_category: string;
  priority: string | null;
  assignee: string | null;
  project: string | null;
  labels_json: string;
  updated_at: string;
}

interface SyncRow {
  bb_project_id: string;
  source: string;
  last_synced_at: string | null;
  error: string | null;
  item_count: number;
}

interface ProjectConfigRow {
  bb_project_id: string;
  source: string;
  linear_team_key: string;
  jira_base_url: string;
  jira_email: string;
  jira_jql: string;
}

interface ProjectBoardSettingsRow {
  bb_project_id: string;
  default_view: string;
  enabled_filters_json: string;
  status_order_json: string;
}

interface ProjectFilterStateRow {
  bb_project_id: string;
  filters_json: string;
}

interface FilterPresetRow {
  id: string;
  bb_project_id: string;
  name: string;
  filters_json: string;
  position: number;
}

export interface StoredSyncState {
  lastSyncedAt: string | null;
  error: string | null;
  itemCount: number;
}

export interface WorkItemFilters {
  /** Omit to search every project cache. */
  projectId?: string;
  /** Internal allowlist for intentional cross-project views. */
  projectIds?: string[];
  source?: WorkSource;
  query?: string;
  stateCategories?: WorkStateCategory[];
  limit: number;
}

export type ProjectSourceConfigDefaults = Omit<
  ProjectSourceConfig,
  'projectId'
>;

function itemFromRow(row: WorkItemRow): WorkItem {
  return workItemSchema.parse({
    bbProjectId: row.bb_project_id,
    source: row.source,
    locator: row.locator,
    key: row.item_key,
    title: row.title,
    description: row.description,
    url: row.url,
    status: row.status,
    stateCategory: row.state_category,
    priority: row.priority,
    assignee: row.assignee,
    project: row.project,
    labels: JSON.parse(row.labels_json),
    updatedAt: row.updated_at
  });
}

function configFromRow(row: ProjectConfigRow): ProjectSourceConfig {
  return projectSourceConfigSchema.parse({
    projectId: row.bb_project_id,
    source: row.source,
    linearTeamKey: row.linear_team_key,
    jiraBaseUrl: row.jira_base_url,
    jiraEmail: row.jira_email,
    jiraJql: row.jira_jql
  });
}

function boardSettingsFromRow(
  row: ProjectBoardSettingsRow
): ProjectBoardSettings {
  return projectBoardSettingsSchema.parse({
    projectId: row.bb_project_id,
    defaultView: row.default_view,
    enabledFilters: JSON.parse(row.enabled_filters_json),
    statusOrder: JSON.parse(row.status_order_json)
  });
}

function filterPresetFromRow(row: FilterPresetRow): FilterPreset | null {
  const state = parseJsonSafely(row.filters_json);
  if (state === undefined) return null;
  const parsed = filterPresetSchema.safeParse({
    id: row.id,
    projectId: row.bb_project_id,
    name: row.name,
    state,
    position: row.position
  });
  return parsed.success ? parsed.data : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, character => `\\${character}`);
}

function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function createWorkItemStore(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `
      CREATE TABLE work_items (
        source TEXT NOT NULL CHECK (source IN ('linear', 'github', 'jira')),
        locator TEXT NOT NULL,
        item_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        state_category TEXT NOT NULL CHECK (
          state_category IN ('backlog', 'todo', 'in_progress', 'done', 'canceled')
        ),
        priority TEXT,
        assignee TEXT,
        project TEXT,
        labels_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (source, locator)
      );

      CREATE TABLE source_sync (
        source TEXT PRIMARY KEY CHECK (source IN ('linear', 'github', 'jira')),
        last_synced_at TEXT,
        error TEXT,
        item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0)
      );

      CREATE INDEX idx_work_items_updated
        ON work_items(updated_at DESC, source, locator);
      CREATE INDEX idx_work_items_source_state_updated
        ON work_items(source, state_category, updated_at DESC, locator);
      CREATE INDEX idx_work_items_key
        ON work_items(item_key COLLATE NOCASE);
    `,
    `
      CREATE TABLE work_items_by_project (
        bb_project_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('linear', 'github', 'jira')),
        locator TEXT NOT NULL,
        item_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        state_category TEXT NOT NULL CHECK (
          state_category IN ('backlog', 'todo', 'in_progress', 'done', 'canceled')
        ),
        priority TEXT,
        assignee TEXT,
        project TEXT,
        labels_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (bb_project_id, source, locator)
      );

      CREATE TABLE source_sync_by_project (
        bb_project_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('linear', 'github', 'jira')),
        last_synced_at TEXT,
        error TEXT,
        item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
        PRIMARY KEY (bb_project_id, source)
      );

      CREATE TABLE project_source_config (
        bb_project_id TEXT PRIMARY KEY,
        github_enabled INTEGER NOT NULL CHECK (github_enabled IN (0, 1)),
        linear_team_key TEXT NOT NULL,
        jira_jql TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_project_work_items_updated
        ON work_items_by_project(bb_project_id, updated_at DESC, source, locator);
      CREATE INDEX idx_project_work_items_source_state_updated
        ON work_items_by_project(
          bb_project_id, source, state_category, updated_at DESC, locator
        );
      CREATE INDEX idx_project_work_items_key
        ON work_items_by_project(bb_project_id, item_key COLLATE NOCASE);
    `,
    `
      ALTER TABLE project_source_config
        ADD COLUMN linear_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (linear_enabled IN (0, 1));
      ALTER TABLE project_source_config
        ADD COLUMN jira_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (jira_enabled IN (0, 1));

      CREATE INDEX idx_all_project_work_items_updated
        ON work_items_by_project(updated_at DESC, bb_project_id, source, locator);

      DROP TABLE work_items;
      DROP TABLE source_sync;
    `,
    `
      ALTER TABLE project_source_config
        ADD COLUMN jira_base_url TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_source_config
        ADD COLUMN jira_email TEXT NOT NULL DEFAULT '';

      CREATE INDEX idx_project_source_linear_enabled
        ON project_source_config(linear_enabled, bb_project_id);
      CREATE INDEX idx_project_source_jira_enabled
        ON project_source_config(jira_enabled, bb_project_id);
    `,
    `
      CREATE TABLE project_source_config_next (
        bb_project_id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('linear', 'github', 'jira')),
        linear_team_key TEXT NOT NULL,
        jira_base_url TEXT NOT NULL,
        jira_email TEXT NOT NULL,
        jira_jql TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO project_source_config_next (
        bb_project_id, source, linear_team_key, jira_base_url, jira_email,
        jira_jql, updated_at
      )
      SELECT
        config.bb_project_id,
        CASE
          WHEN config.github_enabled + config.linear_enabled + config.jira_enabled = 0
            THEN 'github'
          WHEN config.github_enabled + config.linear_enabled + config.jira_enabled = 1
            THEN CASE
              WHEN config.jira_enabled = 1 THEN 'jira'
              WHEN config.linear_enabled = 1 THEN 'linear'
              ELSE 'github'
            END
          ELSE COALESCE(
            (
              SELECT candidate.source
              FROM (
                SELECT 'github' AS source, 1 AS priority
                UNION ALL SELECT 'linear', 2
                UNION ALL SELECT 'jira', 3
              ) AS candidate
              LEFT JOIN source_sync_by_project AS sync
                ON sync.bb_project_id = config.bb_project_id
                AND sync.source = candidate.source
              WHERE CASE candidate.source
                WHEN 'github' THEN config.github_enabled
                WHEN 'linear' THEN config.linear_enabled
                ELSE config.jira_enabled
              END = 1
              ORDER BY
                sync.last_synced_at IS NULL ASC,
                sync.last_synced_at DESC,
                candidate.priority DESC
              LIMIT 1
            ),
            CASE
              WHEN config.jira_enabled = 1 THEN 'jira'
              WHEN config.linear_enabled = 1 THEN 'linear'
              ELSE 'github'
            END
          )
        END,
        config.linear_team_key,
        config.jira_base_url,
        config.jira_email,
        config.jira_jql,
        config.updated_at
      FROM project_source_config AS config;

      DELETE FROM work_items_by_project
      WHERE EXISTS (
        SELECT 1
        FROM project_source_config_next AS config
        WHERE config.bb_project_id = work_items_by_project.bb_project_id
          AND config.source <> work_items_by_project.source
      );

      DELETE FROM source_sync_by_project
      WHERE EXISTS (
        SELECT 1
        FROM project_source_config_next AS config
        WHERE config.bb_project_id = source_sync_by_project.bb_project_id
          AND config.source <> source_sync_by_project.source
      );

      DROP TABLE project_source_config;
      ALTER TABLE project_source_config_next RENAME TO project_source_config;

      CREATE INDEX idx_project_source_selected
        ON project_source_config(source, bb_project_id);
    `,
    `
      CREATE TABLE project_board_settings (
        bb_project_id TEXT PRIMARY KEY,
        default_view TEXT NOT NULL CHECK (default_view IN ('list', 'kanban')),
        enabled_filters_json TEXT NOT NULL,
        status_order_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE project_filter_state (
        bb_project_id TEXT PRIMARY KEY,
        filters_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE project_filter_presets (
        id TEXT PRIMARY KEY,
        bb_project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (bb_project_id, name_normalized)
      );

      CREATE INDEX idx_filter_presets_project
        ON project_filter_presets(bb_project_id, position);
    `
  ]);

  const upsertItem = db.prepare<
    [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string,
      string
    ]
  >(`
    INSERT INTO work_items_by_project (
      bb_project_id, source, locator, item_key, title, description, url,
      status, state_category, priority, assignee, project, labels_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bb_project_id, source, locator) DO UPDATE SET
      item_key = excluded.item_key,
      title = excluded.title,
      description = excluded.description,
      url = excluded.url,
      status = excluded.status,
      state_category = excluded.state_category,
      priority = excluded.priority,
      assignee = excluded.assignee,
      project = excluded.project,
      labels_json = excluded.labels_json,
      updated_at = excluded.updated_at
  `);

  function writeItem(item: WorkItem): void {
    const parsed = workItemSchema.parse(item);
    upsertItem.run(
      parsed.bbProjectId,
      parsed.source,
      parsed.locator,
      parsed.key,
      parsed.title,
      parsed.description,
      parsed.url,
      parsed.status,
      parsed.stateCategory,
      parsed.priority,
      parsed.assignee,
      parsed.project,
      JSON.stringify(parsed.labels),
      parsed.updatedAt
    );
  }

  const replaceSourceTransaction = db.transaction(
    (
      projectId: string,
      source: WorkSource,
      items: WorkItem[],
      syncedAt: string
    ) => {
      db.prepare<[string, WorkSource]>(
        'DELETE FROM work_items_by_project WHERE bb_project_id = ? AND source = ?'
      ).run(projectId, source);
      for (const item of items) writeItem(item);
      db.prepare<[string, WorkSource, string, number]>(
        `
        INSERT INTO source_sync_by_project (
          bb_project_id, source, last_synced_at, error, item_count
        ) VALUES (?, ?, ?, NULL, ?)
        ON CONFLICT(bb_project_id, source) DO UPDATE SET
          last_synced_at = excluded.last_synced_at,
          error = NULL,
          item_count = excluded.item_count
      `
      ).run(projectId, source, syncedAt, items.length);
    }
  );

  const readProjectConfig = db.prepare<[string], ProjectConfigRow>(`
    SELECT
      bb_project_id,
      source,
      linear_team_key,
      jira_base_url,
      jira_email,
      jira_jql
    FROM project_source_config
    WHERE bb_project_id = ?
  `);

  const readProjectBoardSettings = db.prepare<
    [string],
    ProjectBoardSettingsRow
  >(`
    SELECT
      bb_project_id,
      default_view,
      enabled_filters_json,
      status_order_json
    FROM project_board_settings
    WHERE bb_project_id = ?
  `);

  const readProjectFilterState = db.prepare<[string], ProjectFilterStateRow>(`
    SELECT bb_project_id, filters_json
    FROM project_filter_state
    WHERE bb_project_id = ?
  `);

  const readFilterPresets = db.prepare<[string], FilterPresetRow>(`
    SELECT id, bb_project_id, name, filters_json, position
    FROM project_filter_presets
    WHERE bb_project_id = ?
    ORDER BY position ASC
  `);

  const readFilterPreset = db.prepare<[string, string], FilterPresetRow>(`
    SELECT id, bb_project_id, name, filters_json, position
    FROM project_filter_presets
    WHERE bb_project_id = ? AND id = ?
  `);

  const clearSourceTransaction = db.transaction(
    (projectId: string, source: WorkSource) => {
      db.prepare<[string, WorkSource]>(
        'DELETE FROM work_items_by_project WHERE bb_project_id = ? AND source = ?'
      ).run(projectId, source);
      db.prepare<[string, WorkSource]>(
        'DELETE FROM source_sync_by_project WHERE bb_project_id = ? AND source = ?'
      ).run(projectId, source);
    }
  );

  function defaultConfig(
    projectId: string,
    defaults: ProjectSourceConfigDefaults
  ): ProjectSourceConfig {
    return projectSourceConfigSchema.parse({ projectId, ...defaults });
  }

  return {
    upsert(item: WorkItem) {
      writeItem(item);
    },
    replaceSource(
      projectId: string,
      source: WorkSource,
      items: WorkItem[],
      syncedAt: string
    ) {
      for (const item of items) {
        if (item.bbProjectId !== projectId || item.source !== source) {
          throw new Error(
            'Cannot write a work item outside its BB project and source scope'
          );
        }
      }
      replaceSourceTransaction(projectId, source, items, syncedAt);
    },
    setSourceError(projectId: string, source: WorkSource, message: string) {
      const count =
        db
          .prepare<
            [string, WorkSource],
            { count: number }
          >('SELECT COUNT(*) AS count FROM work_items_by_project WHERE bb_project_id = ? AND source = ?')
          .get(projectId, source)?.count ?? 0;
      db.prepare<[string, WorkSource, string, number]>(
        `
        INSERT INTO source_sync_by_project (
          bb_project_id, source, last_synced_at, error, item_count
        ) VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(bb_project_id, source) DO UPDATE SET
          error = excluded.error,
          item_count = excluded.item_count
      `
      ).run(projectId, source, message, count);
    },
    syncState(projectId: string, source: WorkSource): StoredSyncState {
      const row = db
        .prepare<[string, WorkSource], SyncRow>(
          `
          SELECT *
          FROM source_sync_by_project
          WHERE bb_project_id = ? AND source = ?
        `
        )
        .get(projectId, source);
      return {
        lastSyncedAt: row?.last_synced_at ?? null,
        error: row?.error ?? null,
        itemCount: row?.item_count ?? 0
      };
    },
    clearSource(projectId: string, source: WorkSource) {
      clearSourceTransaction(projectId, source);
    },
    get(
      projectId: string,
      source: WorkSource,
      locator: string
    ): WorkItem | undefined {
      const row = db
        .prepare<[string, WorkSource, string], WorkItemRow>(
          `
          SELECT *
          FROM work_items_by_project
          WHERE bb_project_id = ? AND source = ? AND locator = ?
        `
        )
        .get(projectId, source, locator);
      return row ? itemFromRow(row) : undefined;
    },
    list(filters: WorkItemFilters): WorkItem[] {
      const query = filters.query?.trim() ?? '';
      const states = filters.stateCategories ?? [];
      const parameters: Record<string, SqlParameter> = {
        projectId: filters.projectId ?? null,
        projectIds: JSON.stringify(filters.projectIds ?? []),
        projectIdsSpecified: filters.projectIds === undefined ? 0 : 1,
        source: filters.source ?? null,
        query: query ? `%${escapeLike(query)}%` : '',
        states: JSON.stringify(states),
        stateCount: states.length,
        limit: filters.limit
      };
      return db
        .prepare<Record<string, SqlParameter>, WorkItemRow>(
          `
          SELECT *
          FROM work_items_by_project AS item
          WHERE item.source = COALESCE(
              (
                SELECT config.source
                FROM project_source_config AS config
                WHERE config.bb_project_id = item.bb_project_id
              ),
              'github'
            )
            AND (:projectId IS NULL OR item.bb_project_id = :projectId)
            AND (
              :projectIdsSpecified = 0 OR
              item.bb_project_id IN (SELECT value FROM json_each(:projectIds))
            )
            AND (:source IS NULL OR item.source = :source)
            AND (
              :query = '' OR
              item.item_key LIKE :query ESCAPE '\\' COLLATE NOCASE OR
              item.title LIKE :query ESCAPE '\\' COLLATE NOCASE OR
              item.description LIKE :query ESCAPE '\\' COLLATE NOCASE OR
              item.project LIKE :query ESCAPE '\\' COLLATE NOCASE
            )
            AND (
              :stateCount = 0 OR
              item.state_category IN (SELECT value FROM json_each(:states))
            )
          ORDER BY item.updated_at DESC, item.bb_project_id, item.source, item.locator
          LIMIT :limit
        `
        )
        .all(parameters)
        .map(itemFromRow);
    },
    projectConfig(
      projectId: string,
      defaults: ProjectSourceConfigDefaults
    ): ProjectSourceConfig {
      const row = readProjectConfig.get(projectId);
      return row ? configFromRow(row) : defaultConfig(projectId, defaults);
    },
    ensureProjectConfig(
      projectId: string,
      defaults: ProjectSourceConfigDefaults
    ): ProjectSourceConfig {
      const config = defaultConfig(projectId, defaults);
      db.prepare<[string, WorkSource, string, string, string, string, string]>(
        `
        INSERT INTO project_source_config (
          bb_project_id, source, linear_team_key, jira_base_url, jira_email,
          jira_jql, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bb_project_id) DO NOTHING
      `
      ).run(
        config.projectId,
        config.source,
        config.linearTeamKey,
        config.jiraBaseUrl,
        config.jiraEmail,
        config.jiraJql,
        new Date().toISOString()
      );
      return configFromRow(readProjectConfig.get(projectId)!);
    },
    saveProjectConfig(input: ProjectSourceConfig): ProjectSourceConfig {
      const config = projectSourceConfigSchema.parse(input);
      return db.transaction(() => {
        const previous = readProjectConfig.get(config.projectId);
        db.prepare<
          [string, WorkSource, string, string, string, string, string]
        >(
          `
          INSERT INTO project_source_config (
            bb_project_id, source, linear_team_key, jira_base_url, jira_email,
            jira_jql, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(bb_project_id) DO UPDATE SET
            source = excluded.source,
            linear_team_key = excluded.linear_team_key,
            jira_base_url = excluded.jira_base_url,
            jira_email = excluded.jira_email,
            jira_jql = excluded.jira_jql,
            updated_at = excluded.updated_at
        `
        ).run(
          config.projectId,
          config.source,
          config.linearTeamKey,
          config.jiraBaseUrl,
          config.jiraEmail,
          config.jiraJql,
          new Date().toISOString()
        );
        if (previous && previous.source !== config.source) {
          db.prepare<[string]>(
            'DELETE FROM work_items_by_project WHERE bb_project_id = ?'
          ).run(config.projectId);
          db.prepare<[string]>(
            'DELETE FROM source_sync_by_project WHERE bb_project_id = ?'
          ).run(config.projectId);
        } else {
          db.prepare<[string, WorkSource]>(
            'DELETE FROM work_items_by_project WHERE bb_project_id = ? AND source <> ?'
          ).run(config.projectId, config.source);
          db.prepare<[string, WorkSource]>(
            'DELETE FROM source_sync_by_project WHERE bb_project_id = ? AND source <> ?'
          ).run(config.projectId, config.source);
        }
        return configFromRow(readProjectConfig.get(config.projectId)!);
      })();
    },
    projectBoardSettings(projectId: string): ProjectBoardSettings {
      const row = readProjectBoardSettings.get(projectId);
      return row
        ? boardSettingsFromRow(row)
        : defaultProjectBoardSettings(projectId);
    },
    saveProjectBoardSettings(input: ProjectBoardSettings): ProjectBoardSettings {
      const settings = projectBoardSettingsSchema.parse(input);
      db.prepare<[string, string, string, string, string]>(
        `
        INSERT INTO project_board_settings (
          bb_project_id, default_view, enabled_filters_json, status_order_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bb_project_id) DO UPDATE SET
          default_view = excluded.default_view,
          enabled_filters_json = excluded.enabled_filters_json,
          status_order_json = excluded.status_order_json,
          updated_at = excluded.updated_at
      `
      ).run(
        settings.projectId,
        settings.defaultView,
        JSON.stringify(settings.enabledFilters),
        JSON.stringify(settings.statusOrder),
        new Date().toISOString()
      );
      return boardSettingsFromRow(
        readProjectBoardSettings.get(settings.projectId)!
      );
    },
    boardFilterState(projectId: string): BoardFilterState | null {
      bbProjectIdSchema.parse(projectId);
      const row = readProjectFilterState.get(projectId);
      if (!row) return null;
      // A row whose JSON is malformed or no longer matches the schema
      // returns null rather than throwing, so a corrupt write or a future
      // schema change degrades to "no saved filters" instead of breaking
      // the board.
      const raw = parseJsonSafely(row.filters_json);
      if (raw === undefined) return null;
      const parsed = boardFilterStateSchema.safeParse(raw);
      return parsed.success ? normalizeBoardFilterState(parsed.data) : null;
    },
    saveBoardFilterState(
      projectId: string,
      input: BoardFilterState
    ): BoardFilterState {
      bbProjectIdSchema.parse(projectId);
      const state = normalizeBoardFilterState(
        boardFilterStateSchema.parse(input)
      );
      db.prepare<[string, string, string]>(
        `
        INSERT INTO project_filter_state (
          bb_project_id, filters_json, updated_at
        ) VALUES (?, ?, ?)
        ON CONFLICT(bb_project_id) DO UPDATE SET
          filters_json = excluded.filters_json,
          updated_at = excluded.updated_at
      `
      ).run(projectId, JSON.stringify(state), new Date().toISOString());
      return state;
    },
    listFilterPresets(projectId: string): FilterPreset[] {
      bbProjectIdSchema.parse(projectId);
      return readFilterPresets
        .all(projectId)
        .map(filterPresetFromRow)
        .filter((preset): preset is FilterPreset => preset !== null);
    },
    saveFilterPreset(input: {
      projectId: string;
      id?: string;
      name: string;
      state: BoardFilterState;
    }): FilterPreset {
      bbProjectIdSchema.parse(input.projectId);
      const name = filterPresetNameSchema.parse(input.name);
      const normalized = normalizePresetName(name);
      const state = normalizeBoardFilterState(
        boardFilterStateSchema.parse(input.state)
      );
      const now = new Date().toISOString();
      function readSavedPreset(id: string): FilterPreset {
        const saved = filterPresetFromRow(
          readFilterPreset.get(input.projectId, id)!
        );
        if (!saved) {
          throw new Error('Saved filter preset could not be read back');
        }
        return saved;
      }
      const conflict = db
        .prepare<[string, string], { id: string; name: string }>(
          `
          SELECT id, name
          FROM project_filter_presets
          WHERE bb_project_id = ? AND name_normalized = ?
        `
        )
        .get(input.projectId, normalized);
      if (conflict && conflict.id !== input.id) {
        throw new Error(
          `A filter preset named "${conflict.name}" already exists`
        );
      }

      if (input.id) {
        const existing = readFilterPreset.get(input.projectId, input.id);
        if (!existing) throw new Error(`Unknown filter preset: ${input.id}`);
        db.prepare<[string, string, string, string, string, string]>(
          `
          UPDATE project_filter_presets
          SET name = ?, name_normalized = ?, filters_json = ?, updated_at = ?
          WHERE bb_project_id = ? AND id = ?
        `
        ).run(
          name,
          normalized,
          JSON.stringify(state),
          now,
          input.projectId,
          input.id
        );
        return readSavedPreset(input.id);
      }

      const id = `fp_${randomUUID().replaceAll('-', '')}`;
      const position = readFilterPresets.all(input.projectId).length;
      db.prepare<
        [string, string, string, string, string, number, string, string]
      >(
        `
        INSERT INTO project_filter_presets (
          id, bb_project_id, name, name_normalized, filters_json, position,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        input.projectId,
        name,
        normalized,
        JSON.stringify(state),
        position,
        now,
        now
      );
      return readSavedPreset(id);
    },
    // Deleting an unknown id is a deliberate no-op, unlike saveFilterPreset
    // and reorderFilterPresets which throw. Delete is idempotent, and the
    // callers resync from the returned list rather than trusting a local
    // delta, so a stale id produces no visible inconsistency.
    deleteFilterPreset(projectId: string, id: string): FilterPreset[] {
      bbProjectIdSchema.parse(projectId);
      return db.transaction(() => {
        db.prepare<[string, string]>(
          `DELETE FROM project_filter_presets
           WHERE bb_project_id = ? AND id = ?`
        ).run(projectId, id);
        // Renumber every remaining row, including any that fail to parse:
        // an unreadable row is invisible to clients but still occupies a
        // position, so leaving it out here would let it collide with a
        // visible row forever instead of just until the next delete.
        const remaining = readFilterPresets.all(projectId);
        const now = new Date().toISOString();
        const updatePosition = db.prepare<[number, string, string, string]>(
          `
          UPDATE project_filter_presets
          SET position = ?, updated_at = ?
          WHERE bb_project_id = ? AND id = ?
        `
        );
        remaining.forEach((row, index) => {
          if (row.position === index) return;
          updatePosition.run(index, now, projectId, row.id);
        });
        return readFilterPresets
          .all(projectId)
          .map(filterPresetFromRow)
          .filter((preset): preset is FilterPreset => preset !== null);
      })();
    },
    reorderFilterPresets(
      projectId: string,
      ids: readonly string[]
    ): FilterPreset[] {
      bbProjectIdSchema.parse(projectId);
      return db.transaction(() => {
        const rows = readFilterPresets.all(projectId);
        // A client can only ever request an order for presets it was
        // shown, and listFilterPresets hides rows that fail to parse. So
        // validate against, and renumber, only the parseable subset —
        // otherwise one corrupt row permanently blocks every reorder for
        // this project, since resolvePresetOrder demands an exact
        // permutation of every stored id. An unreadable row keeps its old
        // position and may end up sharing it with a visible row; that is
        // harmless because the corrupt row is never displayed, and the
        // next delete renumbers every row (visible or not) contiguously
        // from 0 anyway.
        const currentIds = rows
          .filter(row => filterPresetFromRow(row) !== null)
          .map(row => row.id);
        const ordered = resolvePresetOrder(currentIds, ids);
        const positionById = new Map(rows.map(row => [row.id, row.position]));
        const now = new Date().toISOString();
        const updatePosition = db.prepare<[number, string, string, string]>(
          `
          UPDATE project_filter_presets
          SET position = ?, updated_at = ?
          WHERE bb_project_id = ? AND id = ?
        `
        );
        ordered.forEach((id, index) => {
          if (positionById.get(id) === index) return;
          updatePosition.run(index, now, projectId, id);
        });
        return readFilterPresets
          .all(projectId)
          .map(filterPresetFromRow)
          .filter((preset): preset is FilterPreset => preset !== null);
      })();
    },
    configuredProjectIds(): string[] {
      return db
        .prepare<[], { bb_project_id: string }>(
          `
          SELECT bb_project_id
          FROM project_source_config
          ORDER BY bb_project_id
        `
        )
        .all()
        .map(row => row.bb_project_id);
    },
    selectedProjectIds(source: WorkSource): string[] {
      return db
        .prepare<[WorkSource], { bb_project_id: string }>(
          `
          SELECT bb_project_id
          FROM project_source_config
          WHERE source = ?
          ORDER BY bb_project_id
        `
        )
        .all(source)
        .map(row => row.bb_project_id);
    }
  };
}

export type WorkItemStore = ReturnType<typeof createWorkItemStore>;
