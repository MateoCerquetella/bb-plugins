import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { preparationSchema, type Preparation } from './contract.js';
export function preparationStore(bb: Pick<BbPluginApi, 'storage'>) {
  const db = bb.storage.database();
  db.exec(
    'CREATE TABLE IF NOT EXISTS preparations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS preparation_artifacts (id TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, html TEXT NOT NULL)'
  );
  function get(id: string): Preparation {
    const row = db
      .prepare('SELECT document FROM preparations WHERE id=?')
      .get(id) as { document: string } | undefined;
    if (!row) throw new Error('Preparation not found');
    return preparationSchema.parse(JSON.parse(row.document));
  }
  function put(p: Preparation) {
    p.updatedAt = new Date().toISOString();
    preparationSchema.parse(p);
    db.prepare(
      'INSERT INTO preparations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, document=excluded.document'
    ).run(p.id, p.projectId, p.updatedAt, JSON.stringify(p));
    return p;
  }
  function update(id: string, fn: (p: Preparation) => void) {
    return db.transaction(() => {
      const p = get(id);
      fn(p);
      return put(p);
    })();
  }
  function parseRows(rows: unknown): Preparation[] {
    return (rows as { document: string }[]).map((row) =>
      preparationSchema.parse(JSON.parse(row.document))
    );
  }
  function project(projectId: string) {
    return parseRows(
      db
        .prepare(
          'SELECT document FROM preparations WHERE project_id=? ORDER BY updated_at DESC LIMIT 300'
        )
        .all(projectId)
    );
  }
  function forThread(threadId: string, projectId: string) {
    const row = db
      .prepare(
        "SELECT document FROM preparations WHERE project_id=? AND json_extract(document, '$.threadId')=? LIMIT 1"
      )
      .get(projectId, threadId) as { document: string } | undefined;
    return row ? preparationSchema.parse(JSON.parse(row.document)) : null;
  }
  function* pending(): Generator<Preparation> {
    let cursor = '';
    while (true) {
      const page = parseRows(
        db
          .prepare(
            "SELECT document FROM preparations WHERE id>? AND EXISTS (SELECT 1 FROM json_each(preparations.document, '$.jobs') WHERE json_extract(value, '$.status') IN ('queued','starting','running')) ORDER BY id LIMIT 100"
          )
          .all(cursor)
      );
      if (!page.length) return;
      yield* page;
      cursor = page[page.length - 1]!.id;
    }
  }
  return {
    get,
    put,
    update,
    project,
    forThread,
    pending,
    artifact(id: string, prep: string) {
      const row = db
        .prepare(
          'SELECT html FROM preparation_artifacts WHERE id=? AND preparation_id=?'
        )
        .get(id, prep) as { html: string } | undefined;
      if (!row) throw new Error('Prototype artifact not found');
      return row.html;
    },
    saveArtifact(id: string, prep: string, html: string) {
      db.prepare('INSERT INTO preparation_artifacts VALUES(?,?,?)').run(
        id,
        prep,
        html
      );
    }
  };
}
