import { PGlite } from "@electric-sql/pglite";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coreTechnologiesRules, evaluate } from "@fola/policy";
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveRule,
  loadActiveRules,
  migrate,
  MIGRATIONS_DIR,
  proposeRule,
  seedCoreTechnologies,
  type Db,
} from "../src/index.js";

function pgliteDb(pg: PGlite): Db {
  return {
    query: async (sql, params) => (await pg.query(sql, params)).rows as never,
    exec: async (sql) => {
      await pg.exec(sql);
    },
  };
}

// Booting PGlite takes seconds, so boot once and reset the schema between tests.
const db: Db = pgliteDb(new PGlite());
beforeEach(async () => {
  await db.exec("drop schema public cascade; create schema public;");
}, 30_000);

describe("migrate", () => {
  it("applies all migrations once", async () => {
    expect(await migrate(db)).toEqual(["0001_init.sql", "0002_lock_down_api_access.sql"]);
    expect(await migrate(db)).toEqual([]);
  });

  it("enables row level security on every table and makes views respect it", async () => {
    await migrate(db);
    const open = await db.query<{ relname: string }>(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(open).toEqual([]);
    const views = await db.query<{ relname: string }>(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and not coalesce('security_invoker=true' = any(c.reloptions), false)`,
    );
    expect(views).toEqual([]);
  });

  it("refuses to run when an applied migration was edited", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fola-migrations-"));
    await cp(MIGRATIONS_DIR, dir, { recursive: true });
    await migrate(db, dir);

    await writeFile(join(dir, "0001_init.sql"), "-- edited\n", { flag: "a" });
    await writeFile(join(dir, "0002_next.sql"), "create table later (id int);");
    await expect(migrate(db, dir)).rejects.toThrow(/0001_init.sql was edited after it was applied/);
    // Nothing pending ran.
    await expect(db.query("select * from later")).rejects.toThrow();
  });

  it("rolls back a failing migration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fola-migrations-"));
    await writeFile(join(dir, "0001_bad.sql"), "create table a (id int); select * from does_not_exist;");
    await expect(migrate(db, dir)).rejects.toThrow();
    await expect(db.query("select * from a")).rejects.toThrow();
    expect(await db.query("select * from schema_migrations")).toEqual([]);
  });
});

describe("seed and rules", () => {
  let workspaceId: string;
  beforeEach(async () => {
    await migrate(db);
    workspaceId = await seedCoreTechnologies(db);
  });

  it("round-trips the seed rules through the database", async () => {
    const loaded = await loadActiveRules(db, workspaceId);
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(loaded.sort(byId)).toEqual([...coreTechnologiesRules].sort(byId));

    const decision = evaluate({ kind: "sql", sql: "select sum(total_amount) from orders", purpose: "reporting" }, loaded);
    expect(decision.allowed).toBe(false);
  });

  it("is idempotent", async () => {
    expect(await seedCoreTechnologies(db)).toBe(workspaceId);
    expect(await loadActiveRules(db, workspaceId)).toHaveLength(coreTechnologiesRules.length);
  });

  it("only applies a new rule version after an admin approves it", async () => {
    await db.query(
      `insert into workspace_members (workspace_id, slack_user_id, role) values ($1, 'U_ADMIN', 'admin'), ($1, 'U_MEMBER', 'member')`,
      [workspaceId],
    );
    const original = coreTechnologiesRules.find((r) => r.id === "no-origin-main")!;
    const stricter = { ...original, check: { ...original.check, refs: ["origin/main", "main"] } as typeof original.check };
    const mergeMain = { kind: "git" as const, operation: "merge" as const, ref: "main" };

    const version = await proposeRule(db, workspaceId, stricter, "U_MEMBER");
    expect(version).toBe(2);
    expect(evaluate(mergeMain, await loadActiveRules(db, workspaceId)).allowed).toBe(true);

    await expect(approveRule(db, workspaceId, "no-origin-main", 2, "U_MEMBER")).rejects.toThrow(/not an admin/);
    await approveRule(db, workspaceId, "no-origin-main", 2, "U_ADMIN");
    expect(evaluate(mergeMain, await loadActiveRules(db, workspaceId)).allowed).toBe(false);
    await expect(approveRule(db, workspaceId, "no-origin-main", 2, "U_ADMIN")).rejects.toThrow(/No pending version/);
  });

  it("fails closed on a rule with an unknown check type", async () => {
    await db.query(
      `insert into rules (workspace_id, rule_key, version, title, description, severity, check_config, proposed_by, approved_by, approved_at)
       values ($1, 'mystery', 1, 'Mystery', 'x', 'block', '{"type":"does_not_exist"}', 'seed', 'seed', now())`,
      [workspaceId],
    );
    await expect(loadActiveRules(db, workspaceId)).rejects.toThrow(/unknown check type/);
  });

  it("keeps the audit log append-only", async () => {
    await db.query(`insert into audit_log (workspace_id, actor, event) values ($1, 'fola', 'test')`, [workspaceId]);
    await expect(db.query("update audit_log set event = 'changed'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from audit_log")).rejects.toThrow(/append-only/);
  });
});
