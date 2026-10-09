import { analyzeSql, touches, type SqlAnalysis } from "./sql.js";
import type { Action, EvaluationContext, Rule, RuleCheck } from "./types.js";

type CheckOf<T extends RuleCheck["type"]> = Extract<RuleCheck, { type: T }>;

/** Returns violation messages for one rule; empty when the action passes or the rule doesn't apply. */
type Checker<T extends RuleCheck["type"]> = (
  check: CheckOf<T>,
  action: Action,
  ctx: EvaluationContext,
  sql: () => SqlAnalysis,
) => string[];

function splitColumn(qualified: string): [string, string] {
  const dot = qualified.lastIndexOf(".");
  return [qualified.slice(0, dot).toLowerCase(), qualified.slice(dot + 1).toLowerCase()];
}

function normalizeRef(ref: string): string {
  return ref.replace(/^refs\/(remotes|heads)\//, "").trim();
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

const unverifiable = (error: string) =>
  `Could not parse the SQL to verify this rule, so it is blocked (${error}).`;

const checkers: { [T in RuleCheck["type"]]: Checker<T> } = {
  forbidden_read_columns(check, action, _ctx, sql) {
    if (action.kind !== "sql" || !check.purposes.includes(action.purpose)) return [];
    const analysis = sql();
    if (!analysis.ok) return [unverifiable(analysis.error)];
    const hits = check.columns.filter((qualified) => {
      const [table, column] = splitColumn(qualified);
      return analysis.columns.some(
        (ref) => ref.access === "read" && touches(ref, table, column, analysis.tables),
      );
    });
    return hits.map((c) => `Reads ${c} in a ${action.purpose} query.`);
  },

  forbidden_write_columns(check, action, _ctx, sql) {
    if (action.kind !== "sql") return [];
    const analysis = sql();
    if (!analysis.ok) return [unverifiable(analysis.error)];
    const hits = check.columns.filter((qualified) => {
      const [table, column] = splitColumn(qualified);
      if (!analysis.writeTables.has(table)) return false;
      const refs = analysis.columns.filter((ref) => ref.access === "write");
      // A write with no column list (e.g. INSERT ... VALUES) can set any column.
      return refs.length === 0 || refs.some((ref) => touches(ref, table, column, analysis.writeTables));
    });
    return hits.map((c) => `Writes ${c}.`);
  },

  forbidden_git_refs(check, action) {
    if (action.kind !== "git" || !check.operations.includes(action.operation)) return [];
    const ref = normalizeRef(action.ref);
    return check.refs.some((r) => normalizeRef(r) === ref)
      ? [`git ${action.operation} with ${ref} is not allowed.`]
      : [];
  },

  allowed_migration_targets(check, action) {
    if (action.kind !== "migration_apply") return [];
    return check.targets.includes(action.target)
      ? []
      : [`Applying migrations to "${action.target}" is not allowed (allowed: ${check.targets.join(", ")}).`];
  },

  applied_migrations_immutable(_check, action, ctx) {
    if (action.kind !== "file_write" && action.kind !== "migration_create") return [];
    if (ctx.appliedMigrations === undefined) {
      return ["The list of applied migrations was not provided, so this file write can't be verified."];
    }
    const path = normalizePath(action.path);
    return ctx.appliedMigrations.map(normalizePath).includes(path)
      ? [`${path} is an applied migration and is frozen.`]
      : [];
  },

  migration_separate_grants(_check, action) {
    if (action.kind !== "migration_create") return [];
    const statements = action.sql
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const grants = statements.filter((s) => /^(alter\s+default\s+privileges\b.*\s)?grant\b/is.test(s));
    const tightenings = statements.filter(
      (s) =>
        /^(alter\s+default\s+privileges\b.*\s)?revoke\b/is.test(s) ||
        /\b(enable|force)\s+row\s+level\s+security\b/i.test(s),
    );
    return grants.length > 0 && tightenings.length > 0
      ? ["This migration mixes grants with tightenings (REVOKE / row level security). Split it into two migrations."]
      : [];
  },

  forbidden_claim(check, action) {
    if (action.kind !== "text_output") return [];
    const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
    const subjects = lower(check.subjects);
    const claims = lower(check.claims);
    const sentences = action.text.split(/(?<=[.!?])\s+|\n+/);
    return sentences
      .filter((s) => {
        const t = s.toLowerCase();
        return subjects.some((x) => t.includes(x)) && claims.some((x) => t.includes(x));
      })
      .map((s) => `"${s.trim()}"`);
  },

  guidance() {
    return [];
  },
};

export function runCheck(rule: Rule, action: Action, ctx: EvaluationContext, sql: () => SqlAnalysis): string[] {
  const checker = checkers[rule.check.type] as Checker<RuleCheck["type"]>;
  return checker(rule.check, action, ctx, sql);
}

export function lazySqlAnalysis(action: Action): () => SqlAnalysis {
  let cached: SqlAnalysis | undefined;
  return () => {
    if (action.kind !== "sql") throw new Error("SQL analysis requested for a non-SQL action");
    return (cached ??= analyzeSql(action.sql));
  };
}
