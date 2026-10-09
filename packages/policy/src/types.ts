/**
 * An action Danny plans to take. The tool gateway builds one of these for every
 * tool call and asks the policy engine for a decision before executing it.
 */
export type Action =
  | SqlAction
  | GitAction
  | MigrationApplyAction
  | MigrationCreateAction
  | FileWriteAction
  | TextOutputAction;

/** Why a query runs. Reporting rules (e.g. the money rule) only apply to some purposes. */
export type SqlPurpose = "reporting" | "operational";

export interface SqlAction {
  kind: "sql";
  sql: string;
  purpose: SqlPurpose;
}

export type GitOperation = "branch" | "merge" | "rebase" | "push";

export interface GitAction {
  kind: "git";
  operation: GitOperation;
  /** The ref being branched from, merged in, or rebased onto. For push, the destination branch. */
  ref: string;
}

export interface MigrationApplyAction {
  kind: "migration_apply";
  /** Environment name, e.g. "staging" or "production". */
  target: string;
}

export interface MigrationCreateAction {
  kind: "migration_create";
  path: string;
  sql: string;
}

export interface FileWriteAction {
  kind: "file_write";
  path: string;
}

export interface TextOutputAction {
  kind: "text_output";
  text: string;
}

/**
 * Facts the gateway supplies from trusted sources (the repo, the DB). The agent
 * never supplies these, so it can't talk its way past a check.
 */
export interface EvaluationContext {
  /** Repo-relative paths of migration files already applied to any environment. */
  appliedMigrations?: readonly string[];
}

export const RULE_CHECK_TYPES = [
  "forbidden_read_columns",
  "forbidden_write_columns",
  "forbidden_git_refs",
  "allowed_migration_targets",
  "applied_migrations_immutable",
  "migration_separate_grants",
  "forbidden_claim",
  "guidance",
] as const satisfies readonly RuleCheck["type"][];

/** The checks a workspace rule can configure. Rules are data; these are the only code. */
export type RuleCheck =
  | {
      type: "forbidden_read_columns";
      /** "table.column" pairs. */
      columns: string[];
      purposes: SqlPurpose[];
    }
  | {
      type: "forbidden_write_columns";
      /** "table.column" pairs. */
      columns: string[];
    }
  | {
      type: "forbidden_git_refs";
      refs: string[];
      operations: GitOperation[];
    }
  | {
      type: "allowed_migration_targets";
      targets: string[];
    }
  | { type: "applied_migrations_immutable" }
  | { type: "migration_separate_grants" }
  | {
      type: "forbidden_claim";
      /** A sentence mentioning any subject... */
      subjects: string[];
      /** ...must not also contain any claim phrase. */
      claims: string[];
    }
  /** Prompt-only rule with no automated check. */
  | { type: "guidance" };

export type Severity = "block" | "warn";

export interface Rule {
  id: string;
  title: string;
  /** Plain-language rule as the admin wrote it. Also rendered into Danny's instructions. */
  description: string;
  severity: Severity;
  check: RuleCheck;
}

export interface Violation {
  ruleId: string;
  severity: Severity;
  message: string;
}

export interface Decision {
  /** False when any blocking violation was found. */
  allowed: boolean;
  violations: Violation[];
}
