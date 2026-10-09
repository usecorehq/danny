import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { transaction, type Db } from "./client.js";

export const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url).pathname;

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(dir, name), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }),
  );
}

async function ensureTable(db: Db): Promise<void> {
  await db.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

export async function appliedMigrations(db: Db): Promise<Map<string, string>> {
  await ensureTable(db);
  const rows = await db.query<{ name: string; checksum: string }>("select name, checksum from schema_migrations");
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

/**
 * Applies pending migrations in filename order, one transaction each. Refuses to
 * run at all if an applied file was edited or deleted: applied migrations are frozen.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = await readMigrations(dir);
  const applied = await appliedMigrations(db);

  const byName = new Map(files.map((f) => [f.name, f]));
  const problems: string[] = [];
  for (const [name, checksum] of applied) {
    const file = byName.get(name);
    if (!file) problems.push(`${name} was applied but its file is missing`);
    else if (file.checksum !== checksum) problems.push(`${name} was edited after it was applied`);
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to migrate. Applied migrations are frozen:\n- ${problems.join("\n- ")}`);
  }

  const pending = files.filter((f) => !applied.has(f.name));
  for (const file of pending) {
    await transaction(db, async () => {
      await db.exec(file.sql);
      await db.query("insert into schema_migrations (name, checksum) values ($1, $2)", [file.name, file.checksum]);
    });
  }
  return pending.map((f) => f.name);
}
