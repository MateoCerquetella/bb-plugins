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
  function all() {
    return (
      db
        .prepare(
          'SELECT document FROM preparations ORDER BY updated_at DESC LIMIT 300'
        )
        .all() as { document: string }[]
    ).map((r) => preparationSchema.parse(JSON.parse(r.document)));
  }
  return {
    get,
    put,
    update,
    all,
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
