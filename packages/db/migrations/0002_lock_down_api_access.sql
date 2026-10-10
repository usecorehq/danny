-- Supabase exposes the public schema through its auto-generated REST API. Enable
-- row level security with no policies so the anon and authenticated roles can't
-- read or write these tables. Fola's server connects as the table owner, which
-- bypasses RLS. Tightening only: no grants in this migration.

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table rules enable row level security;
alter table memory_items enable row level security;
alter table tasks enable row level security;
alter table approvals enable row level security;
alter table audit_log enable row level security;
alter table schema_migrations enable row level security;

-- Views run as their owner by default, which would bypass RLS on rules.
alter view active_rules set (security_invoker = true);
