# PRD: Danny, Qorelly's AI Employee

Oct 9, 2026 · Core Technologies LTD · Draft v0.1

Reference: Viktor PRD (Oct 9, 2026). Danny takes Viktor's model of one shared AI employee per company and builds it for Core Technologies first, then for Qorelly's SME customers.

---

## 1. Overview

**What Danny is.** Danny is one shared AI employee for the company. Teammates @mention Danny in Slack. Danny works in its own sandbox, uses our tools, and posts finished work back in the thread. One shared memory means a correction from one person applies to everyone.

**Problem.** Our team loses hours every week to repeated work:

- Writing paste-ready prompts for coding agents, then reviewing their reports by hand.
- Pulling numbers from staging and production for reports and investor updates.
- Chasing reviews, migrations, staging checks and support follow-ups.
- Answering the same "how does X work / where is Y" questions about Qorelly, Qore Catalog and Qore Maps.

Personal AI chats help one person at a time. What they learn, including our engineering rules, stays in private chats and has to be re-explained each time.

**Bet.** Danny is a hire, not a tool. Danny knows our rules (the money rule, staging-only migrations, branch rules) as shared memory and enforces them on every task.

**Two stages:**

1. **Danny Internal.** Core Technologies' own AI employee. We dogfood it on our own work.
2. **Danny for Qorelly.** An AI employee inside Qorelly for Nigerian SMEs. It works over WhatsApp and the Qorelly dashboard and uses the merchant's Qorelly data. This is the North Star.

### Why build it instead of buying Viktor

| Factor | Viktor | Danny |
| --- | --- | --- |
| Knows our rules | Learns them over time, as generic memory | Rules are coded as guardrails from day one |
| Data access | OAuth to SaaS tools | Native access to Qorelly / Catalog / Maps data, with row-level scoping |
| Cost | USD credits, about $100+/month plus top-ups | Pay model cost directly; prices in ₦ for customers |
| Channel | Slack / Teams | Slack internally; **WhatsApp** for SMEs (where Nigerian SMEs actually work) |
| Product upside | None; we stay a customer | Becomes a Qorelly feature and a revenue line |

**Honest call:** buying Viktor would get Stage 1 working faster. Building only makes sense because Stage 2 is the real prize. If we drop Stage 2, buy Viktor.

---

## 2. Target users

### Stage 1: Internal (Core Technologies)

| User | Primary jobs |
| --- | --- |
| Founders / CTO | Metrics, investor updates, reviewing agent reports, production readiness checks |
| Engineers | Audits, prompt drafting, PR review against our rules, staging checks |
| Ops / support | Merchant support triage, onboarding follow-ups |
| Catalog team | Data quality checks on Qore Catalog |

### Stage 2: Qorelly customers (North Star)

Owners and managers of Nigerian SMEs (roughly 1 to 50 staff) running on Qorelly: retail, hospitality (folios), services. Most of them use WhatsApp, not Slack, and often work from a phone on patchy data.

---

## 3. Core use cases

### Stage 1: Internal

| Team | Example job | Output |
| --- | --- | --- |
| Engineering | "Danny, draft the audit prompt for the invoices refactor" | Paste-ready agent prompt following our PROMPT RULES (audit first, show DDL, stop on contradictions) |
| Engineering | Review a coding agent's pasted report against the prompt it was given | In-thread review: what was done, what was skipped, rule violations |
| Engineering | Check a PR for hard-rule violations (reads `orders.total_amount` for revenue, client writes `paid_amount`, edits an applied migration, branches from `origin/main`) | PR review comment |
| Founders / finance | "Last month's revenue by vertical, in ₦" | One-pager that reads only from `paid_amount` / `order_payments` / `invoices.amount_paid` / `folio_charges` |
| Founders | Monthly investor update draft | Doc that reports capital raised as **₦0 / $0 until an investment closes**; grants and credits listed separately |
| Ops / support | Triage overnight merchant tickets, draft replies, flag churn risk | Drafted replies plus Jira issues |
| Catalog | Weekly check of Qore Catalog for duplicates, missing prices and stale SKUs | Scheduled report |
| Everyone | "Where is the folio charge logic?" / "What did we decide about X?" | Answer with links to code, docs and Slack threads |

### Stage 2: Qorelly customers

| Job | Output |
| --- | --- |
| "How much did we make this week?" (on WhatsApp) | Short ₦ summary from paid amounts only |
| Chase unpaid invoices | Drafted WhatsApp/SMS reminders, sent only after owner approval |
| Low-stock alert, with reorder suggestion priced from Qore Catalog | Proactive message plus a draft purchase order |
| End-of-day reconciliation (cash vs. transfers vs. POS) | Daily report that flags mismatches |
| Hotel: "Who checks out tomorrow with open folio balances?" | List plus drafted messages to guests |

---

## 4. Architecture

```
Slack / WhatsApp / Qorelly dashboard
            │  @mention, DM, scheduled trigger
            ▼
   ┌──────────────────┐
   │  Channel adapter │  normalizes message, resolves user + workspace + role
   └────────┬─────────┘
            ▼
   ┌──────────────────┐     ┌───────────────────────┐
   │   Danny agent    │◄───►│ Shared memory         │  rules, preferences, corrections,
   │  (Claude, agent  │     │ (Postgres + pgvector) │  glossary, past tasks; per workspace
   │   loop)          │     └───────────────────────┘
   └────────┬─────────┘
            ▼
   ┌──────────────────┐
   │  Policy engine   │  hard rules (money rule, migration rules, branch rules)
   │  + approval gate │  irreversible → Approve/Reject in thread
   └────────┬─────────┘
            ▼
   ┌──────────────────┐     ┌───────────────────────┐
   │   Tool gateway   │────►│ Secrets vault         │  model never sees credentials
   └────────┬─────────┘     └───────────────────────┘
            ▼
 GitHub · staging DB (read replica) · Jira · Google Drive · Slack · Qorelly API · Qore Catalog API
            │
            ▼
   ┌──────────────────┐
   │  Sandbox         │  per-workspace container for running code, queries, file generation
   └──────────────────┘
```

Each request goes through one agent and one shared memory. The policy engine checks the planned action before the tool gateway touches any live system. That makes our hard rules part of the system, not just text in a prompt.

**Recommended stack (to be confirmed by audit):**

- Agent: Claude via the Claude Agent SDK, which gives the agent loop, tool use and sandboxing.
- Memory, routines and audit log: Postgres in our existing stack. Migrations are file-first via `pnpm db:migrate` and applied to staging only.
- Tool gateway: our own thin service. Each connector is an MCP server so we can reuse existing ones (GitHub, Slack, Jira, Google Drive).
- Feature configuration (which tools are on, approval rules, model tier) lives in **DB columns, not env vars**.

---

## 5. Functional requirements

**FR1. Chat-native interface**
- Stage 1: Slack app that responds to @mentions in channels and to DMs.
- Danny posts progress and results in the same thread, with reactions (👀 working, ✅ done, ⏸ waiting for approval) and file attachments.
- Stage 2: WhatsApp Business API and an in-dashboard chat panel in Qorelly.

**FR2. Shared workspace memory**
- One memory per workspace, shared by all teammates.
- Memory types: **rules** (hard, admin-only to edit), **preferences** (soft; anyone can add), **facts** (glossary, who owns what), **task history**.
- Corrections are stored with the author and timestamp. Rule changes need admin approval so one person can't spread a wrong correction to everyone (a risk Viktor carries).
- Admins can view, edit, export and wipe memory.

**FR3. Built-in company rules (seeded at install)**
- Money rule: revenue, reporting and analytics read only from `paid_amount`, `order_payments`, `invoices.amount_paid` or `folio_charges`, never from `orders.total_amount` or `orders.subtotal`. The policy engine rejects SQL that breaks this in a reporting context.
- Danny never writes `orders.paid_amount`.
- Git: never branch from or merge `origin/main`. Push the current branch, then branch from it or from staging.
- Migrations: file-first, staging only. Danny never applies anything to production and never edits an applied migration file. Grants and tightenings never share a migration.
- Funding language: grants, credits and prize money are never "funding raised".
- Currency defaults to ₦.

**FR4. Integrations (Stage 1 set, in priority order)**
1. Slack (read channels Danny is in, post, upload files).
2. GitHub (read code and PRs, comment; open PRs only on non-default branches).
3. Staging database, **read-only role on a read replica**.
4. Jira / Confluence.
5. Google Drive / Gmail / Calendar.
6. Qorelly, Qore Catalog and Qore Maps internal APIs.

No "No API" browser automation in Stage 1. It breaks easily and we don't need it yet.

**FR5. Execution sandbox**
- Per-workspace container where Danny writes and runs code (SQL, Python, Node) and generates files.
- No production write credentials ever reach the sandbox.

**FR6. Outputs**
- Answers in thread; PDF, XLSX and CSV files; Markdown docs.
- Paste-ready coding-agent prompts (long, self-contained, audit-first, scoped to one slice).
- GitHub PR comments and draft PRs; Jira issues.
- Stage 3+: hosted internal pages and dashboards (the equivalent of Viktor Spaces).

**FR7. Routines**
- Approve a result once ("make this weekly"), and Danny reruns it on a schedule (e.g. Monday 9:00 WAT revenue summary in #founders).
- Danny can propose routines; proposals stay paused until approved.
- Proactive checks come later (Stage 3): anomalies nobody asked about, such as a payment-trigger mismatch or a Catalog import failure.

**FR8. Approvals**
- Any irreversible or outward-facing action waits for Approve/Reject in the thread: sending email/WhatsApp to customers, merging, pushing, writing to any DB, moving money, posting outside the thread.
- Admins choose which tools and actions need approval, per workspace, stored in DB columns.
- Every approval and action goes into an append-only audit log (who asked, who approved, what ran).

**FR9. Skills**
- Written, versioned playbooks Danny follows (e.g. "write an audit prompt", "monthly investor update", "review agent report").
- Stage 3: record a screen session and Danny drafts a skill from it.

**FR10. Model choice**
- Two tiers: **Standard** (fast, cheaper; default for chat and routines) and **Deep** (top model; for prompts, reviews and multi-step investigations). Set per workspace and per routine.

---

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Compliance | Nigeria Data Protection Act 2023 (NDPA) and NDPC guidance from day one; GDPR-aligned. SOC 2 only when an enterprise customer asks for it |
| Encryption | TLS 1.2+ in transit; AES-256 at rest; secrets in a vault |
| Credentials | Gateway injects tokens at execution time; the model never sees them; keys are access-logged and rotatable |
| Data use | No training on customer data; model providers only under zero-retention / no-training terms |
| Tenancy | Memory, skills, integrations and sandbox isolated per workspace; Stage 2 uses Postgres row-level security per merchant |
| Database access | Read-only role by default; production only through approved read replicas; no direct prod writes, ever |
| Prompt injection | Ticket bodies, emails, WhatsApp messages and web pages are data, not instructions; high-risk tools stay behind approval |
| Admin controls | Pause a user, disconnect a tool or kill a task in one click |
| Reliability (targets) | 99.5% Slack responsiveness; first acknowledgement < 5s; ≥ 80% of tasks accepted without correction by end of Stage 1 |
| Cost | Per-task cost logged in ₦ and USD; monthly cap per workspace with alerts at 50/80/100% |
| Low bandwidth (Stage 2) | WhatsApp replies under ~1,000 characters by default, with attachments only on request |

---

## 7. Roadmap: MVP to North Star

Each phase is a set of small, verifiable slices. Each slice gets a read-only audit first. Everything is tested on staging.

### Phase 0: Foundations (1–2 weeks)

Goal: a skeleton that can't do damage.

- Repo scaffold (this repo), Slack app, agent loop on the Claude Agent SDK.
- Postgres schema for `workspaces`, `memory_items`, `tasks`, `approvals`, `audit_log`, `routines`, applied through file-first migrations on staging.
- Tool gateway with **two read-only connectors**: GitHub (read) and Slack.
- Seed memory with company rules (FR3).

**Exit:** Danny answers "where is X in the code?" in Slack with correct file links, and every call shows in the audit log.

### Phase 1: MVP, "Danny the engineering teammate" (3–4 weeks)

Goal: save the founders and engineers real hours on our current loop (discuss → prompt → agent → report → review).

- **Prompt writer:** turns a Slack thread into a paste-ready agent prompt that follows PROMPT RULES.
- **Report reviewer:** pasted agent report plus the original prompt → verdict on scope, skipped steps, rule violations and missing screenshots.
- **PR rule checker:** comments on PRs that break the money rule, migration rules or branch rules.
- Shared memory with corrections and the admin-gated rules layer.
- Read-only staging DB connector, so Danny can show real DDL instead of guessing column names.

**Exit criteria:**

- Used in ≥ 10 real tasks/week by ≥ 3 teammates.
- ≥ 70% of drafted prompts used with only small edits.
- Zero hard-rule violations in Danny's own output.

**Why this MVP and not revenue reports first:** it is the highest-frequency pain we have and it is read-only (low risk). It also builds the rules engine that every later phase needs.

### Phase 2: "Danny the ops teammate" (4–6 weeks)

- Reporting skill: revenue/usage summaries that follow the money rule, as XLSX/PDF.
- Routines: approve once, then it runs on a schedule (WAT timezone).
- Approval gate live for the first write actions: Jira issues, draft PRs, emails from Danny's own address.
- Jira, Google Drive and Gmail connectors.
- Support triage on merchant tickets with drafted replies.
- Investor update draft with the funding-language rule enforced.

**Exit:** ≥ 3 approved routines running weekly; ≥ 5 hours/week saved (self-reported); no unapproved outward action.

### Phase 3: "Danny the proactive teammate" (6–8 weeks)

- Proactive checks: anomaly detection on staging/prod read replicas (payment-trigger drift, Catalog import failures, Maps data gaps), proposed as routines.
- Skills library plus skills drafted from screen recordings.
- Hosted internal pages and dashboards (the equivalent of Viktor Spaces).
- Draft PRs end to end: Danny runs the audit, the slice and a staging check, then hands the PR to a human for review. Danny never merges.

**Exit:** Danny catches at least one real issue before a human does; internal NPS ≥ 8.

### Phase 4: North Star, "Danny for Qorelly"

Goal: every Qorelly merchant gets an AI employee that knows their business.

- **4a: Private beta (10–20 merchants).** In-dashboard chat, read-only: "how much did we make", stock levels, unpaid invoices. Row-level security per merchant. Answers follow the money rule.
- **4b: WhatsApp channel.** Owner talks to Danny on WhatsApp. Daily/weekly summaries as routines.
- **4c: Actions with approval.** Invoice reminders to customers, reorder drafts priced from Qore Catalog, folio follow-ups for hotels. Every outward message gets owner approval at first; owners can later auto-approve trusted actions.
- **4d: Monetization.** Priced per business, not per seat, in ₦. Proposed: free tier inside existing Qorelly plans (limited questions/month), then a "Danny" add-on with monthly task credits. Pricing to be validated in the beta, not guessed now.

**North Star metric:** weekly active merchants who approved at least one Danny action.

---

## 8. Success metrics

| Metric | Stage | Why it matters |
| --- | --- | --- |
| Weekly active teammates using Danny | 1 | Proves the "shared employee" bet |
| Tasks accepted without correction (%) | 1–4 | Quality |
| Hard-rule violations in Danny output | 1–4 | Must stay at **0** |
| Approved routines and their rerun rate | 2+ | Recurring value |
| Hours saved per week (self-reported, then measured) | 1–3 | ROI vs. building cost |
| Model cost per task (₦) | All | Unit economics before Stage 4 pricing |
| Weekly active merchants with ≥ 1 approved action | 4 | North Star |
| Danny add-on conversion and retention lift for Qorelly | 4 | Business case |

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Wrong action in a live system | Read-only first; approval gate; no prod write credentials anywhere in Danny |
| One wrong correction spreads to the whole team | Rules layer is admin-gated; corrections stored with author and can be reverted |
| Reports use the wrong money columns | Policy engine checks generated SQL, not just the prompt |
| Prompt injection through tickets or WhatsApp messages | Untrusted content treated as data; outward tools behind approval |
| Model cost in USD while customers pay in ₦ (FX risk) | Per-task cost tracking from Phase 0; cheaper tier by default; caps |
| We build Viktor's breadth instead of our depth | Few connectors, deep Qorelly integration; no "No API" mode |
| Stage 2 gets stuck because Stage 1 never ends | Fixed exit criteria per phase; Stage 4a starts once Phase 2 exits |
| NDPA compliance for merchant data | Data-processing terms with providers; data-flow map before 4a |

---

## 10. Open questions

1. Who owns Danny day to day (product owner, on-call)?
2. Hosting: our current cloud, or a separate project for isolation?
3. Do we get a production **read replica** for Danny, or stay staging-only until Phase 3?
4. Which Slack workspace and channels go first?
5. Model budget for Stages 1–3 (₦/month cap)?
6. WhatsApp Business API provider for Stage 4b (Meta directly or a BSP)?
7. How does Danny settle conflicting instructions from two teammates? Proposed: the rules layer wins, then the most senior role, then ask in thread.
8. Danny's persona and voice for merchants: same "Danny" name in Stage 4, or white-labelled per business?

---

## 11. First slice (next step)

**Phase 0, slice 1: read-only audit + scaffold plan.** No code yet. The agent audits the existing Qorelly repo for:

- the DB stack and migration tooling (`pnpm db:migrate` layout);
- existing Slack/GitHub integrations;
- where a new service should live.

It reports back with the DDL for any tables Danny will read (`orders`, `order_payments`, `invoices`, `folio_charges`). Then we write the Phase 0 implementation prompt.
