-- Phase 0 schema. Everything is keyed by workspace_id: Core Technologies is workspace #1.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  slack_team_id text unique,
  -- Feature configuration lives here, not in env vars.
  model_tier text not null default 'standard' check (model_tier in ('standard', 'deep')),
  approval_required_actions text[] not null
    default array['git.push', 'git.merge', 'sql.write', 'email.send', 'message.external'],
  monthly_budget_usd numeric(12, 2),
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces (id) on delete cascade,
  slack_user_id text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, slack_user_id)
);

-- Rules are versioned. A version takes effect once an admin approves it.
create table rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  rule_key text not null,
  version integer not null check (version > 0),
  title text not null,
  description text not null,
  severity text not null check (severity in ('block', 'warn')),
  check_config jsonb not null check (jsonb_typeof(check_config -> 'type') = 'string'),
  enabled boolean not null default true,
  proposed_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, rule_key, version),
  check ((approved_by is null) = (approved_at is null))
);

-- The latest approved version of each rule, if it is enabled.
create view active_rules as
select r.*
from rules r
where r.approved_at is not null
  and r.enabled
  and r.version = (
    select max(r2.version)
    from rules r2
    where r2.workspace_id = r.workspace_id
      and r2.rule_key = r.rule_key
      and r2.approved_at is not null
  );

create table memory_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('preference', 'fact', 'correction')),
  content text not null,
  created_by text not null,
  source_ref text,
  superseded_by uuid references memory_items (id),
  created_at timestamptz not null default now()
);

create index memory_items_workspace_idx on memory_items (workspace_id) where superseded_by is null;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  requested_by text not null,
  slack_channel_id text,
  slack_thread_ts text,
  request text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_approval', 'done', 'failed', 'cancelled')),
  model_tier text not null check (model_tier in ('standard', 'deep')),
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_workspace_status_idx on tasks (workspace_id, status);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  task_id uuid not null references tasks (id) on delete cascade,
  action jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null))
);

create table audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces (id),
  task_id uuid references tasks (id),
  actor text not null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_workspace_idx on audit_log (workspace_id, created_at);

create function audit_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row execute function audit_log_append_only();
