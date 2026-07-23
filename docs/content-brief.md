# Fleetworks — Content Brief

Source: README.md + PRODUCT.md (where present) from each sibling app repo, read
2026-07-22. Chorus and Rolodex have no PRODUCT.md in their repos, so their
positioning/target-user notes below are inferred from README content only — no
invented features. Helmsman's PRODUCT.md file exists but its contents describe
an unrelated product (a CLI config-sync tool called "Workloom" — likely stale/
misplaced doc), so it was **not** used; Helmsman's brief is grounded entirely in
its README.

---

## Platform narrative (for the Fleetworks home page)

**Fleetworks is a unified control plane for your org's infrastructure.** Instead
of five different internal tools with five different auth models and five
different ideas of what a "service" is, Fleetworks gives every team one
consistent way to catalog, observe, and act on the systems they run — from the
services themselves down to DNS, identity, deployments, and the cloud
infrastructure underneath.

- **Yellow Pages** is the backbone: the authoritative catalog of every service,
  team, and cloud account in the org. Everything else in the suite links back
  to it.
- **Rolodex** is the directory: who your people are, what groups they belong
  to, and which service accounts and access grants tie back to those groups —
  synced from Active Directory/Workday, with SSH keys and access provisioning
  built in.
- **Chorus** is DNS: every record and domain an org owns, who's allowed to
  touch it, and what's safe to expose publicly.
- **Helmsman** is deployments and automation: applications, CI/CD pipelines,
  cluster deployments, and now the agents and multi-agent processes doing the
  work — all under one audit trail.
- **Warden** is cloud governance: the front door to your Terraform Cloud
  workspaces and AWS/Azure accounts, with guarded writes and a deterministic
  review of what's actually configured.

The thread connecting them: **everything is cataloged, observable, and
trackable** through one suite, with a consistent permission model (unix-style
owner/group/other) and org-scoping throughout, instead of five different
bespoke admin panels. Register a service in Yellow Pages, and its DNS in
Chorus, its deployments in Helmsman, its cloud accounts in Warden, and its
owning team's directory data in Rolodex all resolve back to the same source of
truth.

**Who it's for:** individual developers and small teams who want
infrastructure visibility without standing up five separate admin tools, and
platform/DevOps engineers at larger companies who need one governed,
audited system of record across services, identity, DNS, deployments, and
cloud accounts.

Fleetworks is heading toward public beta, with live demos of each app
available now — this is a working suite, not a concept.

---

## Yellow Pages — the catalog

**Positioning:** The authoritative service catalog — the registry of every
service, team, and cloud account in the org, and the backbone the rest of the
Fleetworks suite links back to.

**Features:**
- Full CRUD over six core resources — Service (~93 fields), Agent, Team, AWS
  Account, Azure Account, and Label — via REST API and admin web UI.
- chmod-style RBAC (owner/group/other, 9-bit mode) on every resource, with
  public-readable defaults and admin bypass; anonymous callers see only
  published rows.
- API keys, outbound webhooks (HMAC-signed), and read-only connectors
  (Coastguard, DNS) for integrating the catalog with other systems.
- Cross-resource search (`/api/search`) and an agent registry that lets
  Helmsman-managed agents register themselves into the catalog.

**Target user:** External, multi-tenant developers and platform/ops engineers
self-serving through the web console — fluent in dev tooling, expecting the
console to mirror concepts they already know (services, teams, cloud accounts,
labels) rather than reinvent them.

---

## Rolodex — the directory

**Positioning:** A read-only directory-lookup service that unifies Active
Directory and Workday user/group data — plus SSH keys and outbound access
provisioning — behind one API.

**Features:**
- GET lookups for users and groups by sAMAccountName, distinguishedName, DSS
  username, employee number, or objectGUID, plus name/email/company search.
- Nested-group directory with member counts, and SSH public key lookup by
  user or group.
- Access provisioning: group membership in Rolodex drives outbound GitHub /
  Azure DevOps / GitLab access grants via a pull reconciler (additive,
  report-only, preview-gated).
- Admin portal surfaces for service-account PATs, webhooks, and directory
  sync, plus an unauthenticated public search subtree.

**Target user:** Engineers and internal services that need directory data
(who owns this, what group are they in, what's their SSH key) via API, and org
admins managing directory sync, service-account tokens, and access grants
through the portal. (Inferred from README — no PRODUCT.md in this repo.)

---

## Chorus — DNS

**Positioning:** Org-scoped DNS record and domain management with per-record
unix-style permissions, a public directory for records teams choose to expose,
and webhook-driven automation.

**Features:**
- Full CRUD over A/CNAME/TXT/SRV records and domains, org-scoped, via API and
  dashboard.
- chmod-style permissions (9-bit mode, owner/group/other) on every record —
  private by default, with publishing (the public-view bit) a deliberate,
  guarded action.
- A public directory/search surface for records teams have chosen to publish;
  org-private data never leaks.
- Deterministic record linter flagging bad A-record IPs, malformed/apex
  CNAMEs, oversized TXT records, TTL bounds, and public records that expose
  internal IPs.
- Outbound HMAC-signed webhooks for record/domain events, with retry/backoff
  and dead-lettering.

**Target user:** Teams managing DNS records and domains across an org, who
need per-record ownership and controlled, opt-in publishing rather than an
all-or-nothing DNS admin panel. (Inferred from README — no PRODUCT.md in this
repo.)

---

## Helmsman — deployments & agents

**Positioning:** The control plane for deployments and agentic workloads —
applications, CI/CD pipelines, cluster deployments, and agents/multi-agent
processes, all under one org-scoped RBAC and audit model.

**Features:**
- Application lifecycle management (quotas, namespace ownership, compliance
  controls) plus CI/CD pipeline, run, and deployment tracking across clusters.
- Agents as a governed resource: define, invoke (real OpenAI/Claude runtimes,
  per-agent routing), and audit every run.
- Multi-agent processes — sequential, concurrent, handoff, and supervisor
  topologies, with human-in-the-loop approval gates.
- A governed registry of MCP tool servers that agents can use, plus two-way
  sync with Yellow Pages (agents register/update automatically).

**Target user:** Platform/DevOps engineers managing application deployments,
CI/CD, and — increasingly — the agents and automated processes running
alongside them, under a single audited RBAC model.

---

## Warden — cloud & Terraform governance

**Positioning:** The governed front door to your Terraform Cloud footprint —
workspaces, AWS/Azure accounts, and the services that own them, with
org-scoped reads, guarded writes, and a deterministic config review.

**Features:**
- Workspace CRUD (create, list, update VCS provider/tenant) plus a
  deterministic config review that surfaces findings per workspace.
- Org-scoped visibility into the AWS and Azure accounts and services an org
  owns, with onboarding state.
- Scoped API tokens and outbound webhooks (with test delivery and delivery
  history) for integrating workspace events elsewhere.
- Every endpoint requires Supabase JWT or a scoped PAT — a deliberate
  deviation from the reference Terraform Cloud API spec's public endpoints, so
  one org never sees another's data.

**Target user:** Platform/DevOps engineers and org admins managing Terraform
Cloud workspaces and AWS/Azure accounts — fluent in Terraform and cloud
consoles, expecting the same nouns (workspace, service, account, tenant,
region, provider) rather than web-only synonyms.
