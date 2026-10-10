import { lazySqlAnalysis, runCheck } from "./checks.js";
import type { Action, Decision, EvaluationContext, Rule, Violation } from "./types.js";

/**
 * Checks a planned action against a workspace's rules. The gateway calls this
 * before every tool execution and refuses the call when `allowed` is false.
 */
export function evaluate(action: Action, rules: readonly Rule[], ctx: EvaluationContext = {}): Decision {
  const sql = lazySqlAnalysis(action);
  const violations: Violation[] = [];
  for (const rule of rules) {
    for (const detail of runCheck(rule, action, ctx, sql)) {
      violations.push({ ruleId: rule.id, severity: rule.severity, message: `${rule.title}: ${detail}` });
    }
  }
  return { allowed: !violations.some((v) => v.severity === "block"), violations };
}

/** Renders the rules as instructions for Fola's system prompt, so it plans within them. */
export function renderRulesForPrompt(rules: readonly Rule[]): string {
  return rules.map((r) => `- ${r.title}: ${r.description}`).join("\n");
}
