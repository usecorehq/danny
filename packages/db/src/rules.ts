import { RULE_CHECK_TYPES, type Rule, type RuleCheck, type Severity } from "@fola/policy";
import type { Db } from "./client.js";

interface RuleRow {
  rule_key: string;
  title: string;
  description: string;
  severity: Severity;
  check_config: unknown;
}

const knownTypes = new Set<string>(RULE_CHECK_TYPES);

function toRule(row: RuleRow): Rule {
  // Some drivers return jsonb as text.
  const check = (typeof row.check_config === "string" ? JSON.parse(row.check_config) : row.check_config) as RuleCheck;
  if (!knownTypes.has(check?.type)) {
    // Fail closed: a rule the engine can't run means the rules can't be trusted.
    throw new Error(`Rule "${row.rule_key}" has unknown check type "${String(check?.type)}"`);
  }
  return { id: row.rule_key, title: row.title, description: row.description, severity: row.severity, check };
}

/** The rules the policy engine enforces for a workspace: latest approved, enabled version of each. */
export async function loadActiveRules(db: Db, workspaceId: string): Promise<Rule[]> {
  const rows = await db.query<RuleRow>(
    `select rule_key, title, description, severity, check_config
     from active_rules where workspace_id = $1 order by rule_key`,
    [workspaceId],
  );
  return rows.map(toRule);
}

/**
 * Adds a new version of a rule, pending admin approval. It has no effect until
 * approveRule is called, so one person can't change rules for everyone.
 */
export async function proposeRule(db: Db, workspaceId: string, rule: Rule, proposedBy: string): Promise<number> {
  const [row] = await db.query<{ version: number }>(
    `insert into rules (workspace_id, rule_key, version, title, description, severity, check_config, proposed_by)
     select $1, $2, coalesce(max(version), 0) + 1, $3, $4, $5, $6::jsonb, $7
     from rules where workspace_id = $1 and rule_key = $2
     returning version`,
    [workspaceId, rule.id, rule.title, rule.description, rule.severity, JSON.stringify(rule.check), proposedBy],
  );
  return row!.version;
}

/** Approves a pending rule version. Only workspace admins may approve. */
export async function approveRule(
  db: Db,
  workspaceId: string,
  ruleKey: string,
  version: number,
  approvedBy: string,
): Promise<void> {
  const [admin] = await db.query(
    `select 1 from workspace_members where workspace_id = $1 and slack_user_id = $2 and role = 'admin'`,
    [workspaceId, approvedBy],
  );
  if (!admin) throw new Error(`${approvedBy} is not an admin of this workspace`);

  const updated = await db.query(
    `update rules set approved_by = $4, approved_at = now()
     where workspace_id = $1 and rule_key = $2 and version = $3 and approved_at is null
     returning id`,
    [workspaceId, ruleKey, version, approvedBy],
  );
  if (updated.length === 0) throw new Error(`No pending version ${version} of rule "${ruleKey}"`);
}
