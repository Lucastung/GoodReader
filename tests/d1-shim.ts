// 測試用：以 node:sqlite 模擬 Cloudflare D1 的最小介面，並套用 migrations/*.sql
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const norm = (args: unknown[]) => args.map((a) => (a === undefined ? null : a)) as (string | number | null)[];

class Stmt {
  args: unknown[] = [];
  db: DatabaseSync;
  sql: string;
  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...norm(this.args)) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...norm(this.args)).map((r) => ({ ...r })) as T[] };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...norm(this.args));
    return { meta: { changes: Number(r.changes) } };
  }
  exec() {
    return this.db.prepare(this.sql).all(...norm(this.args)).map((r) => ({ ...r }));
  }
}

export function makeD1() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => ({ results: s.exec() }));
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return d1 as unknown as D1Database;
}
