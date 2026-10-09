import type { Rule } from "../types.js";

/**
 * Seed rules for workspace #1 (Core Technologies). These are data: Phase 0's
 * migration loads them into the workspace's rules table, and admins edit them there.
 */
export const coreTechnologiesRules: Rule[] = [
  {
    id: "money-rule",
    title: "Money rule",
    description:
      "Revenue, reporting and analytics read only from paid_amount, order_payments, invoices.amount_paid or folio_charges. Never from orders.total_amount or orders.subtotal.",
    severity: "block",
    check: {
      type: "forbidden_read_columns",
      columns: ["orders.total_amount", "orders.subtotal"],
      purposes: ["reporting"],
    },
  },
  {
    id: "paid-amount-server-only",
    title: "paid_amount is server-owned",
    description: "orders.paid_amount is set by a server trigger. Nothing else writes it.",
    severity: "block",
    check: { type: "forbidden_write_columns", columns: ["orders.paid_amount"] },
  },
  {
    id: "no-origin-main",
    title: "Never branch from or merge origin/main",
    description: "Push the current branch, then branch from it or from staging. Staging is ground truth.",
    severity: "block",
    check: { type: "forbidden_git_refs", refs: ["origin/main"], operations: ["branch", "merge", "rebase"] },
  },
  {
    id: "migrations-staging-only",
    title: "Migrations go to staging only",
    description: "Migrations are file-first via pnpm db:migrate and applied to staging. Production is applied by the CTO.",
    severity: "block",
    check: { type: "allowed_migration_targets", targets: ["staging"] },
  },
  {
    id: "applied-migrations-frozen",
    title: "Applied migrations are frozen",
    description: "Never edit a migration file that has already been applied. Write a new migration instead.",
    severity: "block",
    check: { type: "applied_migrations_immutable" },
  },
  {
    id: "grants-separate-from-tightenings",
    title: "Grants and tightenings never share a migration",
    description: "GRANT statements go in a different migration from REVOKEs and row level security changes.",
    severity: "block",
    check: { type: "migration_separate_grants" },
  },
  {
    id: "funding-language",
    title: "Grants are not funding raised",
    description:
      "Grants, credits and prize money are not \"funding raised\". Capital raised stays at zero until an investment closes.",
    severity: "warn",
    check: {
      type: "forbidden_claim",
      subjects: ["grant", "credit", "prize"],
      claims: ["funding raised", "capital raised", "raised", "fundraise", "funding round"],
    },
  },
  {
    id: "currency-naira",
    title: "Currency is Naira",
    description: "Report money in Nigerian Naira (₦) unless asked otherwise.",
    severity: "warn",
    check: { type: "guidance" },
  },
];
