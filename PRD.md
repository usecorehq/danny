# PRD: Danny, the AI Employee

Oct 9, 2026 · Core Technologies LTD · Draft v0.2

Reference: Viktor PRD (Oct 9, 2026). Danny follows Viktor's model of one shared AI employee per company. We build it for Core Technologies first, then sell it to other businesses.

---

## 1. Overview

**What Danny is.** Danny is one shared AI employee per company. Teammates @mention Danny in Slack. Danny works in its own sandbox, uses the team's tools, and posts finished work back in the thread. One shared memory means a correction from one person applies to everyone.

**Problem.** Small teams lose hours every week to repeated work: reports, reviews, triage, chasing people, answering the same questions. Personal AI chats help one person at a time. What they learn, including the team's rules, stays in private chats and has to be re-explained each time.

**Bet.** Danny is a hire, not a tool. Danny learns how *this* company works and follows its rules on every task, not just its preferences.

**Two stages:**

1. **Danny Internal.** Core Technologies' own AI employee. We use it every day on our own work (Qorelly, Qore Catalog, Qore Maps) until it is clearly worth paying for.
2. **Danny as a product (North Star).** Sold to other businesses as an extra AI employee: one per workspace, in their Slack (later Teams), connected to their tools.

### How Danny differs from Viktor

Viktor already does this at scale (claims 7,000 paying teams). Copying it feature for feature won't win. Danny's edge has to come from what we learn by being our own first customer:

| Viktor | Danny |
| --- | --- |
| Memory holds preferences and corrections | **Rules layer:** company rules are enforced by a policy engine before any action runs, not just remembered |
| Any teammate's correction spreads to everyone | Rule changes are admin-approved, versioned and can be reverted |
| 3,200+ shallow connectors plus "No API" browser mode | Fewer connectors, done deeply, starting with the engineering and ops stack |
| Generalist | Starts strong on **engineering-team work** (agent prompts, report review, PR rule checks), then widens |

**Honest call:** if we only wanted Stage 1, buying Viktor would be faster and cheaper. Building is worth it because (a) the rules engine is a real gap, and (b) we get a product out of work we'd do anyway. If Stage 1 doesn't save us ≥ 5 hours a week by the end of Phase 2, stop and buy.

---

## 2. Target users

### Stage 1: Internal (Core Technologies)

| User | Primary jobs |
| --- | --- |
| Founders / CTO | Metrics, investor updates, reviewing agent reports, production readiness checks |
| Engineers | Audits, prompt drafting, PR review against our rules, staging checks |
| Ops / support | Ticket triage, follow-ups |
| Catalog / Maps teams | Data quality checks |

### Stage 2: External customers

Same buyer as Viktor: a founder or ops lead at a 5–50 person startup or SMB that runs on Slack. Our first segment is **small software teams that use AI coding agents**, because that's the work Danny will be best at by then. We widen to ops, finance and support teams after that.

---

## 3. Core use cases

### Stage 1: Internal

| Team | Example job | Output |
| --- | --- | --- |
| Engineering | "Danny, draft the audit prompt for the invoices refactor" | Paste-ready agent prompt that follows our PROMPT RULES (audit first, show DDL, stop on contradictions) |
| Engineering | Review a coding agent's pasted report against the prompt it was given | In-thread verdict: done, skipped, rule violations, missing screenshots |
| Engineering | Check a PR for hard-rule violations (reads `orders.total_amount` for revenue, client writes `paid_amount`, edits an applied migration, branches from `origin/main`) | PR review comment |
| Founders / finance | "Last month's revenue by product, in ₦" | One-pager that reads only from `paid_amount` / `order_payments` / `invoices.amount_paid` / `folio_charges` |
| Founders | Monthly investor update draft | Doc that reports capital raised as zero until an investment closes; grants and credits listed separately |
| Ops / support | Triage overnight tickets, draft replies, flag churn risk | Drafted replies plus Jira issues |
| Catalog | Weekly check for duplicates, missing prices and stale SKUs | Scheduled report |
| Everyone | "Where is the folio charge logic?" / "What did we decide about X?" | Answer with links to code, docs and Slack threads |

### Stage 2: External customers (examples)

| Team | Example job | Output |
| --- | --- | --- |
| Engineering | Turn a Slack discussion into a scoped coding-agent prompt; review the agent's report | Prompt + review in thread |
| Engineering | Enforce the team's own rules on every PR | PR comments |
| Founders / finance | Monthly metrics one-pager from Stripe / their DB | PDF by email |
| Support | Triage tickets, draft replies, open bugs | Drafts + tickets |
| Ops | Weekly recurring reports | Scheduled files in a channel |

---

## 4. Architecture

```
Slack (later Teams)
            │  @mention, DM, scheduled trigger
            ▼
   ┌──────────────────┐
   │  Channel adapter │  normalizes message, resolves user + workspace + role
   └────────┬─────────┘
            ▼
   ┌──────────────────┐     ┌───────────────────────┐
   │   Danny agent    │◄───►│ Shared memory         │  rules, preferences, facts,
   │  (Claude, agent  │     │ (Postgres + pgvector) │  past tasks; per workspace
   │   loop)          │     └───────────────────────┘
   └────────┬─────────┘
            ▼
   ┌──────────────────┐
   │  Policy engine   │  workspace rules checked against the planned action
   │  + approval gate │  irreversible → Approve/Reject in thread
   └────────┬─────────┘
            ▼
   ┌──────────────────┐     ┌───────────────────────┐
   │   Tool gateway   │────►│ Secrets vault         │  model never sees credentials
   └────────┬─────────┘     └───────────────────────┘
            ▼
 GitHub · databases (read-only) · Jira · Google Drive · Slack · other connectors
            │
            ▼
   ┌──────────────────┐
   │  Sandbox         │  per-workspace container for code, queries, file generation
   └──────────────────┘
```

**Multi-tenant from day one.** Core Technologies is just workspace #1. Everything is keyed by `workspace_id`, and nothing about us is hard-coded. Our rules are *data* in our workspace, not code. This is what makes Stage 2 a sales problem rather than a rewrite.

**Recommended stack (to be confirmed by audit):**

- Agent: Claude via the Claude Agent SDK, which gives the agent loop, tool use and sandboxing.
- Memory, routines, approvals and audit log: Postgres. Migrations are file-first via `pnpm db:migrate`, staging only.
- Tool gateway: our own thin service. Each connector is an MCP server so we can reuse existing ones (GitHub, Slack, Jira, Google Drive).
- Feature configuration (enabled tools, approval rules, model tier) lives in **DB columns, not env vars**.

---

## 5. Functional requirements

**FR1. Chat-native interface**
- Slack app: responds to @mentions in channels and to DMs. Microsoft Teams in Stage 2.
- Danny posts progress and results in the same thread, with reactions (👀 working, ✅ done, ⏸ waiting for approval) and file attachments.

**FR2. Shared workspace memory**
- One memory per workspace, shared by all teammates.
- Memory types: **rules** (hard, admin-gated), **preferences** (soft; anyone can add), **facts** (glossary, who owns what), **task history**.
- Corrections are stored with author and timestamp, and can be reverted.
- Admins can view, edit, export and wipe memory.

**FR3. Rules layer (the differentiator)**
- Admins write rules in plain language. Danny compiles each rule into a check the policy engine runs where it can (e.g. SQL column checks, git branch checks, banned phrases), and into prompt guidance where it can't.
- Every planned action is checked before execution. A violation blocks the action and explains which rule it broke.
- Rules are versioned, and a change needs admin approval.
- **Our workspace's seed rules** (they also serve as the test suite for this feature):
  - Money rule: revenue, reporting and analytics read only from `paid_amount`, `order_payments`, `invoices.amount_paid` or `folio_charges`, never from `orders.total_amount` or `orders.subtotal`.
  - Danny never writes `orders.paid_amount`.
  - Never branch from or merge `origin/main`.
  - Migrations: file-first, staging only. Never apply to production; never edit an applied migration. Grants and tightenings never share a migration.
  - Grants, credits and prize money are never "funding raised".
  - Currency defaults to ₦.

**FR4. Integrations (Stage 1 set, in priority order)**
1. Slack (read the channels Danny is in, post, upload files).
2. GitHub (read code and PRs, comment; open PRs only on non-default branches).
3. Postgres, **read-only role** (staging first).
4. Jira / Confluence.
5. Google Drive / Gmail / Calendar.

Stage 2 adds Stripe, Linear, HubSpot, Notion, Zendesk, guided by what customers ask for. No "No API" browser automation until there is clear demand.

**FR5. Execution sandbox**
- Per-workspace container where Danny writes and runs code (SQL, Python, Node) and generates files.
- No production write credentials ever reach the sandbox.

**FR6. Outputs**
- Answers in thread; PDF, XLSX and CSV files; Markdown docs.
- Paste-ready coding-agent prompts.
- GitHub PR comments and draft PRs; Jira/Linear issues.
- Phase 3+: hosted internal pages and dashboards (the equivalent of Viktor Spaces).

**FR7. Routines**
- Approve a result once ("make this weekly"), and Danny reruns it on a schedule in the workspace's time zone.
- Danny can propose routines; proposals stay paused until approved.
- Proactive checks come later (Phase 3): anomalies nobody asked about.

**FR8. Approvals**
- Irreversible or outward-facing actions wait for Approve/Reject in the thread: sending email, merging, pushing, writing to any DB, moving money, posting outside the thread.
- Admins choose which tools and actions need approval, stored per workspace in DB columns.
- An append-only audit log records who asked, who approved and what ran.

**FR9. Skills**
- Written, versioned playbooks (e.g. "write an audit prompt", "monthly investor update", "review agent report").
- Stage 2: skills we write for ourselves become templates customers can install.
- Phase 3: record a screen session and Danny drafts a skill from it.

**FR10. Model choice**
- Two tiers: **Standard** (fast, cheaper; default for chat and routines) and **Deep** (top model; prompts, reviews, multi-step work). Set per workspace and per routine.

**FR11. Self-serve onboarding (Stage 2)**
- Install the Slack app, connect tools, pick or write starter rules, run a first task, all in under 15 minutes.
- Billing and usage dashboard.

---

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Compliance | Nigeria Data Protection Act 2023 (NDPA) for us as the operator; GDPR-aligned for external customers; SOC 2 Type I before selling to teams that require it |
| Encryption | TLS 1.2+ in transit; AES-256 at rest; secrets in a vault |
| Credentials | Gateway injects tokens at execution time; the model never sees them; keys access-logged and rotatable |
| Data use | No training on customer data; model providers only under no-training terms |
| Tenancy | Memory, rules, skills, integrations and sandbox isolated per workspace; Postgres row-level security on `workspace_id` |
| Database access | Read-only role by default; no direct production writes, ever |
| Prompt injection | Ticket bodies, emails, PR text and web pages are data, not instructions; high-risk tools stay behind approval |
| Identity | Slack identity in Stage 1; SAML SSO for larger Stage 2 customers |
| Admin controls | Pause a user, disconnect a tool or kill a task in one click |
| Reliability (targets) | 99.5% availability; first acknowledgement < 5s; ≥ 80% of tasks accepted without correction by end of Stage 1 |
| Cost | Per-task cost logged; monthly cap per workspace with alerts at 50/80/100% |

---

## 7. Roadmap: MVP to North Star

Each phase is a set of small, verifiable slices. Each slice gets a read-only audit first. Everything is tested on staging.

### Phase 0: Foundations (1–2 weeks)

Goal: a multi-tenant skeleton that can't do damage.

- Slack app, agent loop on the Claude Agent SDK.
- Postgres schema keyed by `workspace_id`: `workspaces`, `memory_items`, `rules`, `tasks`, `approvals`, `audit_log`, `routines`.
- Tool gateway with **two read-only connectors**: GitHub (read) and Slack.
- Core Technologies created as workspace #1 with our seed rules loaded as data.

**Exit:** Danny answers "where is X in the code?" in Slack with correct file links, and every call shows in the audit log.

### Phase 1: MVP, "Danny the engineering teammate" (3–4 weeks)

Goal: save us real hours on our current loop (discuss → prompt → agent → report → review).

- **Prompt writer:** turns a Slack thread into a paste-ready agent prompt that follows our PROMPT RULES.
- **Report reviewer:** pasted agent report plus the original prompt → verdict on scope, skipped steps, rule violations and missing screenshots.
- **PR rule checker:** comments on PRs that break workspace rules.
- Rules layer v1: plain-language rules, admin-gated, with SQL and git checks.
- Read-only staging DB connector, so Danny shows real DDL instead of guessing column names.

**Exit criteria:**

- Used in ≥ 10 real tasks/week by ≥ 3 teammates.
- ≥ 70% of drafted prompts used with only small edits.
- Zero rule violations in Danny's own output.

### Phase 2: "Danny the ops teammate" (4–6 weeks)

- Reporting skill (revenue and usage summaries that follow the money rule) as XLSX/PDF.
- Routines: approve once, then it runs on a schedule.
- Approval gate live for the first write actions: Jira issues, draft PRs, emails.
- Jira, Google Drive and Gmail connectors.
- Support triage with drafted replies; investor-update draft.

**Exit (and go/no-go for building vs. buying):** ≥ 3 approved routines running weekly; ≥ 5 hours/week saved; no unapproved outward action.

### Phase 3: Make it sellable (6–8 weeks)

- Self-serve onboarding (FR11), billing, usage dashboard.
- Rules and skills templates taken from our own workspace ("engineering team starter pack").
- Proactive checks; hosted pages and dashboards.
- Security basics for selling: data-processing agreement, privacy policy, start SOC 2 Type I.
- **Design partners:** 5–10 friendly external teams (start with founders we know who use coding agents), free in return for weekly feedback.

**Exit:** ≥ 5 design-partner workspaces active weekly for 4 weeks; at least 3 say they would pay.

### Phase 4: North Star, Danny as a product

- Public launch for small software teams; then widen to ops, finance and support use cases.
- Microsoft Teams; more connectors based on customer demand.
- Pricing per workspace, not per seat, with usage credits like Viktor. Proposed starting point: free trial with credits, then a Team plan priced **below Viktor's entry price**. Validate with design partners; don't set it now.
- Enterprise later: SSO, data residency, per-user spend caps.

**North Star metric:** weekly active paying workspaces where ≥ 3 teammates use Danny.

---

## 8. Success metrics

| Metric | Stage | Why it matters |
| --- | --- | --- |
| Weekly active teammates per workspace | 1–2 | Proves the "shared employee" bet |
| Tasks accepted without correction (%) | 1–2 | Quality |
| Rule violations in Danny output | 1–2 | Must stay at **0** |
| Approved routines and their rerun rate | 1–2 | Recurring value |
| Hours saved per week | 1 | Build-vs-buy decision |
| Model cost per task | 1–2 | Unit economics before pricing |
| Design partner → paid conversion | 2 | Demand proof |
| Weekly active paying workspaces (≥ 3 users) | 2 | North Star |
| Net revenue retention | 2 | Usage growth inside accounts |

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Viktor (and others) are far ahead | Don't compete on breadth; win on rules + engineering-team depth; reconsider at the Phase 2 go/no-go |
| We build only for ourselves and can't sell it | Multi-tenant from Phase 0; nothing Core-specific in code; design partners in Phase 3 |
| Wrong action in a live system | Read-only first; approval gate; no production write credentials anywhere |
| One wrong correction spreads to the whole team | Admin-gated, versioned rules; reversible corrections |
| Prompt injection via tickets, emails or PRs | Untrusted content treated as data; outward tools behind approval |
| Model cost in USD vs. our ₦ costs base | Per-task cost tracking from Phase 0; cheaper tier by default; caps |
| Danny distracts from Qorelly / Catalog / Maps | Fixed phase exit criteria; Phase 2 go/no-go is a real kill switch |
| Data security for external customers' data | Strict tenancy, vault, audit log, DPA and SOC 2 before broad launch |

---

## 10. Open questions

1. Who owns Danny day to day (product owner, on-call)?
2. Hosting: our current cloud, or a separate project for isolation (better for Stage 2)?
3. Model budget for Stages 1–3 (monthly cap)?
4. Does Danny ever get a production read replica internally, or stay staging-only?
5. Is Danny a product under Core Technologies, or its own brand?
6. First external segment: small software teams (recommended) or broader SMB ops teams?
7. How does Danny settle conflicting instructions from two teammates? Proposed: rules win, then the admin's role, then ask in thread.
8. Pricing currency for external customers: USD only, or USD + ₦?

---

## 11. First slice (next step)

**Phase 0, slice 1: read-only audit + scaffold plan.** No code yet. The agent audits our existing repos for:

- the DB stack and migration tooling (`pnpm db:migrate` layout);
- any existing Slack/GitHub integrations;
- where Danny's service should live (this repo, as a standalone service).

It reports back with the DDL for the tables Danny will read internally (`orders`, `order_payments`, `invoices`, `folio_charges`). Then we write the Phase 0 implementation prompt.
