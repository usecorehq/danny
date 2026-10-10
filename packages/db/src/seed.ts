import { coreTechnologiesRules } from "@fola/policy";
import { transaction, type Db } from "./client.js";

export const CORE_TECHNOLOGIES_SLUG = "core-technologies";

/**
 * Creates workspace #1 and loads its seed rules as approved version 1. Idempotent:
 * rules that already exist (in any version) are left alone, so admin edits survive.
 */
export async function seedCoreTechnologies(db: Db): Promise<string> {
  return transaction(db, async () => {
    const [workspace] = await db.query<{ id: string }>(
      `insert into workspaces (slug, name) values ($1, 'Core Technologies')
       on conflict (slug) do update set slug = excluded.slug
       returning id`,
      [CORE_TECHNOLOGIES_SLUG],
    );
    const workspaceId = workspace!.id;

    for (const rule of coreTechnologiesRules) {
      await db.query(
        `insert into rules (workspace_id, rule_key, version, title, description, severity, check_config,
                            proposed_by, approved_by, approved_at)
         select $1, $2, 1, $3, $4, $5, $6::jsonb, 'seed', 'seed', now()
         where not exists (select 1 from rules where workspace_id = $1 and rule_key = $2)`,
        [workspaceId, rule.id, rule.title, rule.description, rule.severity, JSON.stringify(rule.check)],
      );
    }
    return workspaceId;
  });
}
