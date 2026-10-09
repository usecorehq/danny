import { describe, expect, it } from "vitest";
import { coreTechnologiesRules as rules, evaluate, renderRulesForPrompt, type Action } from "../src/index.js";

const ruleIds = (action: Action, ctx = {}) => evaluate(action, rules, ctx).violations.map((v) => v.ruleId);
const reporting = (sql: string): Action => ({ kind: "sql", sql, purpose: "reporting" });

describe("money rule", () => {
  it.each([
    "select sum(total_amount) from orders",
    "select sum(o.total_amount) from orders o",
    "select sum(o.subtotal) from public.orders as o join customers c on c.id = o.customer_id",
    "select * from orders",
    "with m as (select subtotal from orders) select sum(subtotal) from m",
  ])("blocks reporting query: %s", (sql) => {
    const decision = evaluate(reporting(sql), rules);
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.ruleId).toBe("money-rule");
  });

  it.each([
    "select sum(paid_amount) from orders",
    "select sum(amount) from order_payments",
    "select sum(amount_paid) from invoices",
    "select sum(amount) from folio_charges",
    "select count(*) from orders",
    "select sum(total_amount) from quotes",
  ])("allows reporting query: %s", (sql) => {
    expect(evaluate(reporting(sql), rules)).toEqual({ allowed: true, violations: [] });
  });

  it("does not apply to operational queries", () => {
    expect(evaluate({ kind: "sql", sql: "select total_amount from orders where id = 1", purpose: "operational" }, rules).allowed).toBe(true);
  });

  it("blocks SQL it cannot parse", () => {
    const decision = evaluate(reporting("selec total_amount frm orders"), rules);
    expect(decision.allowed).toBe(false);
    expect(decision.violations[0]?.message).toMatch(/Could not parse/);
  });
});

describe("paid_amount is server-owned", () => {
  it.each([
    "update orders set paid_amount = 100 where id = 1",
    "update public.orders o set paid_amount = 0",
    "insert into orders (id, paid_amount) values (1, 5)",
    "insert into orders values (1, 5)",
  ])("blocks: %s", (sql) => {
    expect(ruleIds({ kind: "sql", sql, purpose: "operational" })).toContain("paid-amount-server-only");
  });

  it.each([
    "update orders set status = 'shipped' where id = 1",
    "update invoices set paid_amount = 5 where id = 1",
    "select paid_amount from orders",
  ])("allows: %s", (sql) => {
    expect(ruleIds({ kind: "sql", sql, purpose: "operational" })).not.toContain("paid-amount-server-only");
  });
});

describe("git rules", () => {
  it.each([
    ["branch", "origin/main"],
    ["merge", "origin/main"],
    ["rebase", "refs/remotes/origin/main"],
  ] as const)("blocks %s from %s", (operation, ref) => {
    expect(evaluate({ kind: "git", operation, ref }, rules).allowed).toBe(false);
  });

  it.each([
    ["branch", "staging"],
    ["branch", "claude/feature-x"],
    ["merge", "staging"],
    ["push", "claude/feature-x"],
  ] as const)("allows %s with %s", (operation, ref) => {
    expect(evaluate({ kind: "git", operation, ref }, rules).allowed).toBe(true);
  });
});

describe("migration rules", () => {
  it("allows staging and blocks production", () => {
    expect(evaluate({ kind: "migration_apply", target: "staging" }, rules).allowed).toBe(true);
    expect(ruleIds({ kind: "migration_apply", target: "production" })).toEqual(["migrations-staging-only"]);
  });

  const applied = { appliedMigrations: ["migrations/0001_init.sql"] };

  it("blocks edits to applied migrations", () => {
    expect(ruleIds({ kind: "file_write", path: "./migrations/0001_init.sql" }, applied)).toEqual([
      "applied-migrations-frozen",
    ]);
  });

  it("allows new migration files", () => {
    expect(evaluate({ kind: "file_write", path: "migrations/0002_next.sql" }, rules, applied).allowed).toBe(true);
  });

  it("blocks file writes when the applied list is missing", () => {
    expect(ruleIds({ kind: "file_write", path: "src/app.ts" })).toEqual(["applied-migrations-frozen"]);
  });

  it("blocks a migration mixing grants and tightenings", () => {
    const sql = `
      -- give the reporting role access
      grant select on order_payments to reporting;
      alter table invoices enable row level security;
    `;
    expect(ruleIds({ kind: "migration_create", path: "migrations/0003.sql", sql }, applied)).toEqual([
      "grants-separate-from-tightenings",
    ]);
  });

  it("allows grant-only and tightening-only migrations", () => {
    for (const sql of [
      "grant select on order_payments to reporting; grant select on invoices to reporting;",
      "revoke update on orders from app_user; alter table orders force row level security;",
    ]) {
      expect(evaluate({ kind: "migration_create", path: "migrations/0004.sql", sql }, rules, applied).allowed).toBe(true);
    }
  });
});

describe("funding language", () => {
  it("warns when grants are described as funding raised, without blocking", () => {
    const decision = evaluate({ kind: "text_output", text: "Great quarter. We raised $50k from the Google grant." }, rules);
    expect(decision.allowed).toBe(true);
    expect(decision.violations.map((v) => [v.ruleId, v.severity])).toEqual([["funding-language", "warn"]]);
  });

  it("accepts correct wording", () => {
    const text = "Capital raised: ₦0.\nGrants and credits received: $50k (not counted as funding).";
    expect(evaluate({ kind: "text_output", text }, rules).violations).toEqual([]);
  });
});

it("renders every rule into prompt guidance", () => {
  const prompt = renderRulesForPrompt(rules);
  for (const rule of rules) expect(prompt).toContain(rule.title);
});
