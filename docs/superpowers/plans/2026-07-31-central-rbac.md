# Central RBAC — sub-project 4

**Status:** plan, not executed. Written 2026-07-31; **§1 and Phase 2 rewritten
the same day** after an architect + critic review rejected the first draft.

Prereqs done: Phase 1 auth (per-app Supabase), Phase 2 sub-projects 1 & 2 (the
Zitadel hub + "Sign in with Fleetworks" on all five apps). See
`2026-07-30-fleetworks-auth-hub-pilot.md`.

> **Why this was rewritten.** The first draft's §1 was titled "measured, not
> assumed" and contained roughly eight claims contradicted by the source it
> cited — including the identity join, the state of the enforcement plane, and
> the existence of the read path Phase 1 proposed to build. Every claim in the
> new §1 carries a `file:line`, and §1.6 lists what remains **unverified**. Do
> not size any phase off a claim that isn't in §1.1–§1.5.

---

## 1. What exists today

Every statement below was read in source. Line numbers are as of 2026-07-31.

### 1.1 Two authorization models, and neither is what the first draft described

**yellow-pages** — `apps/api/src/auth/middleware.ts:91-99`:

```ts
const raw = app.groups ?? p.groups ?? app.teams ?? []
const role = (app.role ?? p.role) as string | undefined
const isAdmin = role === 'admin' || app.is_admin === true || p.is_admin === true
```

- Reads `app_metadata.groups`, `groups`, `app_metadata.teams`. **`roles` is read
  nowhere in yellow-pages** — `app_metadata.roles` greps to zero hits across
  `apps/` and `packages/`.
- Write gate, `apps/api/src/auth/write-guard.ts:35` — `if (user.isAdmin || user.groups.length > 0)`.
  **A non-empty `groups` array IS the write grant.** Safe today only because
  nothing populates it.
- API-key callers short-circuit **before** the group check, `write-guard.ts:25-28`;
  their `groups` come from `api_keys.owner_group` (`middleware.ts:76-83`). This
  is a second authorization path with no `AuthRole` equivalent.
- No org concept at all — `packages/core/src/rbac.ts:37-42`.

**helmsman, rolodex, warden, chorus** — all four already resolve roles through
the `@cogs/auth` plugin engine on **every request today**:

| repo | import site | plugin set |
|---|---|---|
| rolodex | `apps/api/src/auth/middleware.ts:3-9` | `:60-70` |
| helmsman | `apps/api/src/auth/middleware.ts:5-9` | `:55-60` |
| warden | `apps/api/src/auth/middleware.ts:5-9` | `:70-75` |
| chorus | `apps/api/src/auth/middleware.ts:5-9` | `:55-60` |

Each constructs `new IdpTokenPlugin()` + `new DatabasePlugin(dbRoleLookup)` and
calls `resolveRolesFromPlugins`. **So their role source is `IdpToken ∪ org_members`,
not `org_members` alone**, and Phase 3 is not greenfield wiring — it modifies the
live auth path of four production apps.

`org_members.role` is a **single `text` column**, unique per (org, user), in all
four — so there is no representable *local deny*, only a single granted role.

### 1.2 `@cogs/auth` — in production, and three behaviours differ from its docs

- `resolveRolesFromPlugins` runs plugins in parallel, unions, maps, floors —
  `plugins/orchestrator.ts:33-38`. The floor is **fail-open**: no resolvable
  role yields `[DEFAULT_ROLE]` = `org:viewer` (`types.ts:26`).
- **Mapping is a union, not a precedence.** `mapping.ts:68-83` does
  `rules = [...dbRules, ...this.envRules]` and evaluates every rule into a `Set`.
  The file's own docstring says "DB rules take precedence over env rules" — the
  docstring is wrong. Any design that relies on a DB rule *overriding* an env
  rule is relying on behaviour that does not exist.
- **Env var names are `ROLE_MAP_ADMIN` / `_CONTRIBUTOR` / `_VIEWER` / `_CI_AGENT`**
  (`config.ts:96-99`), not `ROLE_MAP_ORG_*`. Values are **comma-split**
  (`config.ts:63-69`), so an LDAP DN — which always contains commas — **cannot be
  expressed in this format at all**, and a trailing comma yields a `*` pattern
  that `globMatch` (`mapping.ts:27`) matches against everything.
- **`AuthRole` passthrough:** `mapping.ts:63-66` — any external group string that
  is literally `org:admin` becomes `org:admin` with no rule configured.
- **Objects degrade to their keys.** `claim-utils.ts:26-28` —
  `extractStrings` returns `Object.keys(value)` for any object (a deliberate
  Zitadel-shape accommodation). Combined with the passthrough above, a claim
  shaped `{"org:admin": false}` grants `org:admin`. The value is never read.
- **`SupabasePlugin` reads `app_metadata.roles` by default** (`supabase.ts:23`)
  and is explicitly documented to read **only** server-writable paths, "never
  from `user_metadata`, which end users can edit" (`supabase.ts:4-5`). A
  namespaced key therefore requires passing `supabaseRoleClaim` in **every**
  consuming app — miss one and it silently resolves to `org:viewer`.
- It also ignores `ctx.orgId` entirely (`supabase.ts:26`), so a pushed role is
  not tenant-bound.
- `LdapPlugin` takes an injected `LdapClient`, no `ldapjs` dependency
  (`plugins/ldap.ts:10-12`), and swallows errors to `[]` (`:22-28`).
- **Test coverage is thin where it matters.** `packages/auth/test/` holds
  `mapping`, `orchestrator`, `roles`, `verify`, `impersonation`. There are **no
  tests for `LdapPlugin`, `SupabasePlugin`, `UserinfoPlugin`, `IdpTokenPlugin`,
  `DatabasePlugin`, or `claim-utils`** — and the orchestrator tests use fake
  plugins.

### 1.3 Rolodex's access engine is real, and works differently than assumed

`apps/api/src/access/reconcile.ts` is ~391 lines of working desired-vs-actual
diff with run rows, preview gating, enforcement levels, protected principals and
per-target failure isolation. Three connectors ship with tests (`github-`,
`gitlab-`, `azure-devops-connector`). It is not scaffolding.

**It does not join on email.** `reconcile.ts:84-89`:

```ts
const identity = await db.query.userExternalIdentities.findFirst({
  where: and(
    eq(userExternalIdentities.userId, member.userId),
    eq(userExternalIdentities.provider, target.provider),
  ),
})
```

- A member with no matching row is counted `skipped_unmapped` and **never enters
  the diff** (`:92-104`). Email appears nowhere in `runReconcile`.
- `user_external_identities` is **`UNIQUE (user_id, provider)`**
  (`0003_careful_madame_hydra.sql:78`), so one row cannot represent the same
  person across five Supabase projects that each assign a different `auth.users.id`.
- The only population path is a manual CSV import keyed
  `sAMAccountName,provider,external_login` — `routes/access.ts:707,728-839`.

**Revocation is off by default.** `0004_thin_cerise.sql:2` —
`enforcement text DEFAULT 'additive' NOT NULL`; `reconcile.ts:33-35` coerces
anything unrecognised to `additive`; `:264-278` writes `revoke_reported,
applied: false` and **never calls `revokeGrant`**. Under the shipped default a
removed grant persists indefinitely. Because the diff key is
`principal|target|role` (`:148-152`), a *downgrade* emits grant(new) +
revoke(old) — so under `additive` the user keeps **both** roles.

**A clean run is not a silent run.** `reconcile.ts:164-172` writes a
`noop_already_granted` row for every already-correct grant, every run.

**The reverse lookups the first draft proposed to build already exist:**

- `routes/ldap.ts:136-144` `getMemberOfGroups(userId)` — the members→groups
  direction, already consumed by `/user/{username}` and every `/user-by-*` route.
- `routes/ldap.ts:409-427` `/search/users/{value}` already does
  `ilike(directoryUsers.mail, '%value%')` and returns each user **with groups**.
- The real defect is narrower: that matcher is a **substring** match on `mail`
  **only** — `work_email` is not searched, and `a@x.com` matches `maria@x.com`.
  Correct for a search box, disqualifying for an identity join.

**Binding routes are unscoped and self-confirmable.** `getCallerOrg` guards all
seven target routes (`access.ts:88,142,183,238,293,321,356`) and **none** of the
six binding routes (`:426,476,514,567,638,667`). `GET /bindings` (`:477`) has no
`WHERE` clause. `POST /bindings/{id}/confirm` (`:667-704`) sets
`confirmedBy: user.id` with no check against `createdBy`, and `role` is an
unvalidated `z.string()` (`:393`). **The "two-phase approval" is one principal
calling two endpoints.**

**Approval covers the edge, never the membership.** `previewed` resets on a
role/`external_target` PATCH (`:578-592`) and on an external-login change during
import (`:794-829`) — but **not** on a change to `group_members`, which
`reconcile.ts:77-81` re-expands ungated on every run.

**Other load-bearing facts:**

- `provider` is a closed set: zod enum `access.ts:43`, a literal union on the
  connector interface `connector.ts:29`, and a registry `connector.ts:62-66`.
  Adding `'fleetworks'` is three type-level changes plus a connector.
- `fetchActual` is complete-or-throw; partial results are forbidden
  (`connector.ts:31-40`) and a throw fails the whole target run
  (`reconcile.ts:128-144`).
- **Target mutations are unaudited.** `access_bindings` carries `createdBy` and
  `confirmedBy`, and `access_changes` records what the reconciler *did* — but
  nothing records who changed a target's `config`, `enforcement` or `secret`.
  Verified: no `emitEvent` or audit write on the target routes, and zero hits for
  `updatedBy|changedBy|updated_by` across all 20 tables in
  `packages/db/src/schema.ts`. So the ledger captures effects, not causes. A
  credential swap in particular leaves no trace anywhere. Anything that treats
  `access_changes` as *the* audit trail is overclaiming.
- `access_changes` rows are written in **one batch at the end**
  (`reconcile.ts:316-329`) while `applyGrant` calls happen one-by-one
  (`:209-236`). A crash mid-run leaves external writes with **no ledger rows**.
- An `applyGrant` failure is recorded but does **not** set `driftDetected`
  (`:225-236`) — a run where every grant failed reports
  `status: 'success', driftDetected: false`.
- `sealSecret()` is `encryptSecret(plaintext) ?? plaintext`
  (`sync/crypto.ts:66-67`); `getKek()` returns null when `SYNC_SECRET_KEK` is
  unset (`:10-12`). **With no KEK, secrets are stored in plaintext** — while the
  file's own header comment (line 3) claims the opposite.
- **Zero `requireRole` in `routes/ldap.ts`.** The entire HR directory sits behind
  authentication only.
- `getFirstOrgForUser` (`db.ts:6-11`) is a `findFirst` with no `ORDER BY` — a
  multi-org user's resolved org is whatever Postgres returns first.

### 1.4 Zitadel is authentication-only — confirmed

`infra/zitadel.tf:28` — `project_role_assertion = false`, `project_role_check =
false`, and no `zitadel_project_role` / `_grant` resources anywhere. Keep it that
way.

### 1.5 Supabase claim shape — and why the obvious fix is an escalation

Supabase writes federated IdP claims to `user_metadata`, not `app_metadata` —
which is why hub-sourced yellow-pages users arrive with empty `groups` and are
refused by `write-guard.ts`.

**Reading `user_metadata` is not the fix.** End users can edit their own
`user_metadata` through the Supabase client; `@cogs/auth` refuses it for exactly
that reason (`plugins/supabase.ts:4-5`). Any code path that treats it as an
authorization source lets a user self-assert their own roles. The fix is for a
**server-side** path — the reconcile loop, or a `before_user_created` /
`custom_access_token` hook — to copy verified identity into `app_metadata`.

### 1.6 Only one of three sync sources is implemented — it is AD, not Workday

Rolodex is described (including in its own CLAUDE.md) as an Active Directory
**and Workday** cache. Today it is AD only:

| source | file | state |
|---|---|---|
| LDAP / AD | `sync/ldap-source.ts` | 189 lines, real |
| Workday | `sync/workday-source.ts` | **15-line stub**, `:11` throws `'Workday sync not yet implemented'` |
| SCIM | `sync/scim-source.ts` | **15-line stub** |

This explains the column gaps rather than treating them as separate bugs.
`MappedUser` (`sync/source.ts:6-25`) carries exactly: `distinguishedName`
(non-null), `objectGuid`, `samAccountName`, `displayName`, `givenName`, `sn`,
`mail`, `title`, `description`, `telephoneNumber`, `whenCreated`, `manager`,
`employeeType`, `homeDirectory`, `loginShell`, `uidNumber`, `gidNumber`,
`sshPublicKey`, `importedFrom` — every one an AD attribute. Consequently:

- **`work_email`, `employee_number`, `dss_username`, `is_service_account`,
  `worker_status`, `cost_center_unique_id` are never written by any sync.** They
  are the Workday half of the schema, and Workday is a stub. Grepping
  `workEmail|work_email|isServiceAccount|employeeNumber` across `sync/` returns
  nothing.
- Any join reading `mail OR work_email` is really joining on `mail` alone.
- The one exception is `worker_status`, which the **soft-delete** path writes:
  when a DN present in `directory_users` no longer appears in the source snapshot,
  `run.ts:269` sets `workerStatus: 'Inactive'`. So it is an AD-vanished tombstone,
  not an HR status — but it *is* a usable departure signal, and the join must
  reject those rows.
- Sync matches existing rows on `objectGuid`, then falls back to
  `distinguishedName` (`run.ts:120-130`).

### 1.7 NOT verified — do not size off these

- **`hook_custom_access_token_enabled`** — asserted as `false` in the first
  draft. Not found in any `*.tf` or `*.toml` in the tree. **Unconfirmed.**
- **Actual Supabase JWT/refresh TTL** on the five projects — not in any repo;
  it is dashboard/Management-API state. The first draft's "1h + JWT TTL" used a
  number nobody has measured.
- Supabase Admin API `listUsers` pagination cost and rate limits.
- Whether any non-sync path (admin UI, manual SQL) populates `work_email` or
  `is_service_account`. §1.6 establishes only that the **sync** never does.
- Runtime behaviour of anything above. All static reading; no tests were run.

---

## 2. Design

**Rolodex is the RBAC control plane. `@cogs/auth` is the enforcement plane.
Zitadel stays authentication-only.**

The first draft called Supabase "the transport." It is not. `app_metadata` is a
**durable, mutable, multi-writer role store**, and naming it transport is what
licensed skipping ownership, versioning and staleness. Corrected:

> **`app_metadata.<key>` is a rolodex-owned, replicated role cache.**

That forces four things the first draft left implicit, and they are now
deliverables rather than assumptions:

1. **A namespaced key** so rolodex owns exactly one subtree and the diff ignores
   everything else. Without it, `enforcement: 'full'` would strip legitimate
   non-directory grants.
2. **A `syncedAt` stamp and a `source`**, so staleness is detectable at the
   enforcement point. A stale claim must not be byte-identical to a fresh one.
3. **A declared sole writer**, so break-glass lives somewhere that the reconcile
   loop will not fight.
4. **An explicit `enforcement` level per target**, chosen and justified.

Delivery stays **push-primary** — reconcile writes the claim; no rolodex
dependency in the login path. That choice survived review. What did not survive
is the belief that push is *safe by default*: its failure mode is silent
(§1.3, `driftDetected` hole + `last_status` nobody watches), so observability is
part of Phase 2, not a later nicety.

### 2.1 Identity model

The first draft's answer — "verified email → `directory_users.mail`" — is dead.
Email is not an identity: the column has no unique index, `work_email` is never
populated (§1.6), addresses get recycled to new hires (§3), and mailbox control
says nothing about the trustworthiness of the directory row keyed to it.

What the sync actually gives us to key on, in descending order of stability:

| key | populated? | stable across rename/move? | unique index? |
|---|---|---|---|
| `object_guid` | yes, nullable | **yes** — AD's immutable identifier | yes |
| `distinguished_name` | yes, non-null | no — changes on OU move | yes |
| `sam_account_name` | yes, nullable | mostly, but reusable after departure | yes |
| `mail` | yes, nullable | no | **no** |
| `employee_number` | **never** (Workday stub) | — | yes |

**Therefore:** `object_guid` is the identity anchor, `distinguished_name` the
fallback — the same precedence the sync itself uses to match rows
(`run.ts:120-130`), which keeps this model consistent with how the directory
already reconciles itself.

Email's only role is as a **one-time linking hint**, at the moment a Fleetworks
principal is first bound to a directory row — and even then it is a proposal a
human confirms, never an automatic join. The binding is then stored explicitly
(`user_external_identities` is the existing table for exactly this) and keyed on
`object_guid` thereafter. Linking must refuse any row whose
`worker_status = 'Inactive'`.

This is the difference between *authentication* (the hub proved you control this
mailbox) and *identification* (this is which employee you are). The first draft
conflated them; the hub can only ever supply the first.

---

## 3. Threat notes carried into the phases

- **Recycled email address.** `mail`/`work_email` are nullable with **no unique
  index** (`0000_uneven_toad.sql:30-31`; uniques exist only on
  `sam_account_name`, `dss_username`, `distinguished_name`, `object_guid` at
  `:140-143`). A departed employee's address reissued to a new hire inherits
  their groups. No attacker required — and a unique index would not prevent it,
  because reassignment is sequential, not concurrent. Only a stable enterprise
  identifier plus an explicit link lifecycle does.
- **Verified ≠ trustworthy row.** Email verification proves mailbox control. It
  says nothing about whether the `directory_users` row keyed to that address is
  trustworthy — that row is written by an AD/Workday sync outside this plan's
  trust boundary.
- **Secret custody.** A Supabase project secret key is `service_role`: full RLS
  bypass plus `auth.admin` on that project. Five of them in one table makes
  rolodex's database the single highest-value target in the fleet — and rolodex
  is itself one of the five.
- **Deprovisioning ≠ downgrade.** Clearing roles floors a principal at
  `org:viewer` (fail-open, §1.2), and `routes/ldap.ts` has no role gate — so a
  terminated employee with a live refresh token still reads the entire HR
  directory. Session revocation is a **separate deliverable** from role removal.

---

## 4. Phases

> **STATUS 2026-08-01 (updated).** The claim contract's §3 deliverable —
> `FleetworksClaimPlugin` — is **BUILT, merged and published** in `@cogs/auth@0.4.0`
> (`0241394`), and is stronger than §3 specified: it also rejects calendar-overflow
> dates that `Date.parse` rolls *forward* into freshness, far-future stamps that
> never age out, and a `now()` returning `NaN`. Phase 3.1 consumes it; nothing in
> Phase 0–2 needs to build it.
>
> Phase 0 is 5/6 done and Phase 4.3 is fully done — both
> as side effects of the three rolodex security bugs fixed on 2026-07-31.
> Shipped: 0.1 (contract signed off), 0.2 (`e342b1c` — binding routes org-scoped,
> self-confirm rejected; `role` validated against the TARGET'S PROVIDER vocabulary,
> not `AuthRole`, because `access_bindings.role` is an external platform role —
> the plan was wrong on that point), 0.3 (`e342b1c` — target `config`/`enforcement`
> change resets child approvals), 0.5 (`e342b1c` — `sealSecret` throws
> `MissingKekError`), and 4.3 with both prerequisites (`906148a` PAT allowlist,
> `1bae8b5` directory gate — which also needed `/keys/*` gated separately).
> 0.4 shipped as `bcd8c5a` (membership fingerprint; migration `0011` applied to
> production first, since the column is in the Drizzle schema and every
> `access_bindings` select would otherwise 500).
> **Remaining in Phase 0: 0.6 only**, now folded into Phase 2 where the fork lands.
>
> **Phase 1 SHIPPED as `6e2cbff`** (yellow-pages), migration `0018` applied —
> 2 legacy admins carried forward to the namespaced key, legacy keys stripped,
> `provider` preserved on all 5 users. The write gate no longer treats group
> membership as a grant. **Correction to an earlier note in this plan: yellow-pages
> DOES auto-deploy on merge to main** (`deploymentEnabled: {"main": true}` on both
> `apps/api` and `apps/web`); the dual-read is what made the merge-then-migrate
> order safe, not the absence of a deploy. Everything in Phases 1–3 is untouched.

### Phase 0 — the claim contract, and the controls Phase 2 stands on

Ordered first because everything downstream parses or writes this claim. The
previous draft put the parser change before the contract that defines it.

1. **Specify the claim.** Exact path, exact shape (`roles`, `source`, `syncedAt`),
   sole writer, replacement semantics (the owned role array is **replaced**, not
   unioned — an array union can never revoke), and a staleness policy. Note that
   a namespaced path requires `supabaseRoleClaim` in **every** consuming app
   (§1.2) — enumerate them.
2. Fix the binding routes **before** a fleetworks provider exists: org-scope all
   six, reject `confirmedBy === createdBy`, constrain `role` to `AuthRole`.
3. Tie confirmation to what was previewed — a binding revision or membership
   version. Today `confirm` just sets `previewed = true` (`access.ts:667`), and
   toggling `active` deliberately does not reset it (`:594`), so an inactive
   binding can be confirmed without ever entering a reconcile and then activated.
4. **[TODO]** Treat a `group_members` delta on a bound group as approval-invalidating.
   Today only an external-login change resets `previewed` (`access.ts:923`); a
   membership change does not, so approval covers the group→role edge and never
   the group's contents.
5. Make `SYNC_SECRET_KEK` mandatory and `sealSecret` fail loudly, before any
   Supabase key is stored. Decide key custody separately — one application KEK
   over five `service_role` keys keeps the blast radius whether or not the
   plaintext bug is fixed.
6. **[TODO — belongs with Phase 2, blocked on decision 2.1]** Implement the §2.1 identity model: `object_guid` as anchor,
   `distinguished_name` as fallback, email as a one-time human-confirmed linking
   hint only, and reject `worker_status = 'Inactive'` rows at link time.
   **Not `employee_number`** — it is never populated (§1.6).

### Phase 0.7 — two fail-opens found while building 0.4 [TODO]

Both pre-existing, both verified in source 2026-08-01.

1. **Deprovisioning silently stops when a bound group empties.**
   `reconcile.ts:167` builds `uniqueTargets` from `desiredGrants`, then passes it
   to `fetchActual` (`:170`). A bound group with zero *mapped* members contributes
   no `externalTarget`, so the platform's actual grants for that target are never
   fetched, never diffed, and **no revoke is ever emitted** — at exactly the moment
   revocation matters most. No test catches it because `fake-connector.ts:37-53`
   ignores its `_targets` argument and returns everything, so the fake cannot
   express the bug. **Must be fixed before any target is set to
   `enforcement: 'full'` (Phase 2.5)** — under the shipped `additive` default
   nothing revokes anyway, which is the only reason this is currently latent.

2. **`POST /api/access/bindings` never validates `rolodexGroupId`.**
   It org-scopes the *target* (`findTargetInOrg`, the Phase 0.2 fix) but inserts
   the group id on trust, and `directory_groups` has no org column — the directory
   is global. So any `org:admin` can bind **any** group in the directory to their
   own org's target, and can enumerate another tenant's group structure by FK
   error. Latent today with a single production org; real the moment there are two.
   This is a seventh hole inside a route Phase 0.2 already fixed.

### Phase 0.7 update — the fix has a narrower scope than first written

Closing the `uniqueTargets` fail-open by deriving targets from **bindings**
instead of **desired grants** is correct, and it widens what `fetchActual` is
asked for. The three existing connectors are not resilient to that:
`github-connector.ts:60-95` loops targets with **no per-target try/catch**, so a
404 on a deleted or renamed repo now fails that target's entire reconcile and
blocks every other binding on it. `connector.ts:31-40` makes complete-or-throw
deliberate ("partial results are FORBIDDEN"), so relaxing it is a larger change
than this work should carry.

**So the fix is scoped to `fleetworks` only.** github, gitlab and azure-devops
keep the `desiredGrants`-derived target set and therefore **keep the fail-open**:
a bound group with zero mapped members still yields no revoke for those
providers. That is a known, recorded gap, not a solved one. Closing it properly
means teaching those connectors to tolerate a missing target without abandoning
complete-or-throw — its own piece of work.

**The transferable lesson:** the connectors' *code* was untouched, and their
*behaviour* changed anyway, because a shared input widened. "Additive" has to be
judged at the behaviour boundary, not the diff.

### Phase 2.5 — enforcement staging is now a live decision, not a future one

Measured on the Phase 2a branch: with `enforcement` at the shipped `additive`
default, a departed employee (`worker_status = 'Inactive'`) yields
`{departedUsers: 1, revokesReported: 1, revokesApplied: 0}` — the tombstone
blocks a NEW grant and never removes an existing one. **Shipping the connector
alone deprovisions nobody**; the claim stays live in all five projects until a
target is promoted to `full`. The staging (`report_only → additive → full`) is
working as designed; the point is that "Phase 2 shipped" must not be read as
"deprovisioning works".

### Phase 2.9 — four properties the revoke path must hold under `full` [CONSTRAINTS]

Found by the second gate on the connector branch, all four newly live because
`full` was chosen. They are recorded as constraints rather than bugs: any future
change to the revoke path has to preserve them.

1. **Revokes must be restricted to `(externalTarget, role)` pairs an ACTIVE
   binding covers.** `fleetworks.fetchActual` returns every rolodex-sourced claim
   on every user in the project, and the revoke loop revokes anything absent from
   the desired set. Without a covering-pair filter, seeding five targets at `full`
   deletes every pre-existing `{source:'rolodex'}` claim holding a role the
   directory does not reproduce. **This was pinned by a passing test** asserting
   an out-of-band `org:admin` on a stranger IS revoked — the suite certified the
   dangerous behaviour, which is why a green run proved nothing here.
2. **The revoke path must consult `previewed`.** Grants require
   `previewed && !membershipStale`; revokes required only `enforcement === 'full'`.
   Worse, `membershipStale` is itself `binding.previewed && mismatch`, so an
   UNCONFIRMED binding produced no hold and left revokes fully armed — meaning
   `previewed = false` *disarmed* the only protection instead of applying it.
3. **An empty desired state must not wipe the project.** One active binding forces
   a whole-project fetch, so if desired collapses to zero — identity desync,
   departed rows, a lost `user_external_identities` link — every claim in the
   project is revoked, with an unchanged fingerprint so no stale hold fires. Needs
   a floor guard.
4. **The stale hold must be keyed per-binding.** Keying on
   `externalTarget|role` degenerates to role-only for fleetworks, because
   `externalTarget === projectRef` is now guaranteed at both the binding and the
   connector. One stale binding therefore suppressed every revoke of that role
   PROJECT-WIDE, including revokes owned by a properly confirmed binding.

**The pattern worth carrying forward:** widening what a connector fetches is not
a local change. Deriving `uniqueTargets` from bindings closed a real fail-open and
simultaneously converted a narrow revoke path into whole-project authority.
Scoping it to one provider bounded the blast radius to that provider — not to the
bindings that provider manages. Under `additive` none of this was reachable;
`full` made all four lethal at once.

### Phase 2.10 — prerequisites for EVER setting `enforcement: 'full'` [BLOCKING]

Both reproduced as executed revokes by the third gate, at `full`, against a fake
GoTrue. Both are unreachable at `additive` (one `revokeGrant` call site, behind
the `enforcement !== 'full'` return), which is why the connector ships at
`additive`. A **code interlock refuses `full` on a fleetworks target** — delete it
only when both of these are fixed.

1. **Coverage must require a binding to be PRODUCTIVE, not merely active.**
   `coverage.set(key, entry)` runs for every active binding, and only
   `!previewed || membershipStale` unapproves it. `membershipStale` is a
   fingerprint over `group_members`, computed BEFORE the departure and unmapped
   screens — so neither a departure nor an identity desync moves it. A binding
   whose members are all unmapped or departed therefore yields **zero desired
   grants** while asserting `{approved: true}` for its key: full revoke authority
   with nothing to compare against. The floor guard is target-wide, so a second
   healthy binding on another role keeps the total non-zero and it never fires.
   Reproduced: `revokesApplied=1, revoked=[uuid-real-admin/org:admin], unmapped=1`.
   **Fix: a binding confers coverage only if it contributes at least one desired
   grant, and the floor guard must be per-key rather than per-target.**

2. **Role validation must move to read time.** `invalidRoleError` runs only at the
   POST and PATCH write sites. A binding row written and confirmed by a NEWER
   build survives a rollback with `previewed = true` and a valid fingerprint,
   confers coverage for a role this build cannot parse, and then deletes it —
   which is exactly the rollback scenario that motivated preserving
   `unknownRoles` in the first place. Reproduced:
   `revoked=[uuid-victim/org:futurerole]`.

**The insight worth carrying:** authority to revoke was derived from a binding's
*existence*. It has to be derived from its *productivity* — what it actually
contributes to desired state on this run. Three gate rounds each found a new layer
of this same mistake, which is why the interlock is code and not a comment.

### Phase 4.5 — surface a held binding in the UI [TODO]

`binding_stale` maps to no counter on `access_runs`, so a binding held by the
0.4 control appears in the dashboard only as `driftDetected: true` —
indistinguishable from ordinary drift, with no re-confirm prompt. A fail-closed
control nobody can see is a control that gets switched off.

### Phase 1 — unify the vocabulary in yellow-pages

Larger than the first draft implied: it touches `apps/api/src/auth/middleware.ts`,
`packages/core/src/rbac.ts` (a published workspace package),
`apps/api/src/auth/write-guard.ts`, `apps/api/src/auth/rbac.ts`,
`apps/api/src/routes/admin-users.ts`, the API-key principal path, and
`apps/web/src/lib/can-write.ts`. Budget it as such.

1. Derive `AuthRole[]` from the Phase 0 claim, alongside the legacy shape.
2. **In the same commit**, remove `groups.length > 0` from `requireWriteAccess`
   and gate on `org:admin | org:contributor | ci:agent`. Shipping (1) without (2)
   arms an escalation that detonates in Phase 3.
3. **Do not read `user_metadata`.** The first two drafts of this plan said to
   ("app_metadata wins"). That is a self-service privilege escalation — users can
   edit their own `user_metadata`, and `@cogs/auth` refuses it for that reason
   (`supabase.ts:4-5`). Hub users get their claim from the server-side path in
   §1.5, not from a client-writable bag.
4. Retire or namespace the legacy `app_metadata.role` / `is_admin` admin bit
   (`admin-users.ts:~182` — the plan cited `:157`, which is the request destructure, not the write). Left in place, it is a grant the directory cannot
   revoke, which defeats Phase 3's whole point.
5. Give the API-key path an explicit `AuthRole` mapping rather than leaving it
   short-circuited.

**Verify:** three cases, not two — no groups → 403; **groups present but roles =
`['org:viewer']` → 403** (the case the first draft's matrix omitted); contributor
→ 200. Plus a case asserting a self-set `user_metadata` role grants nothing. All
against hand-written fixtures, labelled as parser tests, since nothing writes the
claim until Phase 2.

### Phase 2 — the `fleetworks` connector

Re-scoped. This is a connector with a principal model no existing connector uses,
not a config value.

1. **DECIDED 2026-08-01: fork `runReconcile`'s member-expansion loop** for an
   identity-resolving provider. Rejected: adopting `user_external_identities`
   as-is (its `UNIQUE (user_id, provider)` cannot represent one person across five
   Supabase projects, and it would impose a manual per-employee, per-project CSV
   import), and a purpose-built link table (cleanest model, but a second
   identity-linking concept beside the existing one is how divergence starts —
   this plan exists because three role implementations diverged).

   The fork carries the risk: `runReconcile` is the loop three working connectors
   (github, gitlab, azure-devops) depend on, so the provider branch must be
   additive and those three need regression coverage proving their path is
   untouched. **This is also Phase 0.6** — the fork is where the §2.1 identity
   model lands: `object_guid` anchor, `distinguished_name` fallback, email as a
   one-time human-confirmed linking hint only, reject `worker_status = 'Inactive'`. One target per Supabase project, `external_target` = the
   project ref (restores the dimension the unique index needs). **Do not create a
   rolodex target until Phase 3.4 has settled self-targeting** — a target created
   here lets JWT-derived rolodex admins mutate the bindings that manufacture their
   own authority.
2. Register the provider: zod enum, connector union, registry (§1.3).
3. Implement `fetchActual` with real pagination over `auth.users`, and budget its
   rate-limit cost. Under `enforcement: 'full'`, a short-but-successful
   `fetchActual` revokes everyone it omitted — so this needs a pagination fixture
   test before it runs anywhere near production.
4. `applyGrant` writes **only** the `fleetworks` subtree via the Supabase
   **Admin** API (`PUT /auth/v1/admin/users/{id}`). Note this is a different
   surface from the Management API that `@cogs/supabase-sync` wraps — that
   package touches no user rows at all (zero hits for `app_metadata` /
   `raw_app_meta_data` / `updateUserById` across its `src/`), so the writer needs
   its own client rather than an extension of that one.

   **MEASURED 2026-07-31 against GoTrue v2.192.0** (local stack, throwaway user,
   created and deleted). The semantics are exactly what the contract §1 assumed:

   | level | behaviour | consequence |
   |---|---|---|
   | `app_metadata` top level | **shallow-merged** | sending only `fleetworks` left `provider`, `providers` and an unrelated `legacy_role` intact |
   | the `fleetworks` subtree | **replaced wholesale** | a second write omitting `syncedAt` dropped it; `roles: []` genuinely emptied |

   So **no read-modify-write is needed**, and the cross-process race against
   yellow-pages' `/admin/users` does **not** materialise — the two writers own
   different top-level keys and the merge is per-top-level-key. Subtree
   replacement is also what makes revocation work at all: a deep merge would have
   made `roles: []` a no-op.

   **CONFIRMED ON HOSTED 2026-08-01** (project `ndeubizireenktnvimiq`, throwaway
   user, created and deleted). Hosted behaviour matches local exactly: writing only
   the `fleetworks` subtree left `provider`, `providers` AND the `yellowpages`
   break-glass subtree intact, dropped `syncedAt` (so the subtree is replaced, not
   deep-merged), and `roles: []` genuinely emptied. Revocation therefore works
   under `full`. Still pin it in a test — a future GoTrue that deep-merged would
   silently stop revoking with no error anywhere.
5. **DECIDED 2026-08-01: seed the fleetworks targets at `enforcement: 'full'`
   directly, five-wide.** Production holds zero `access_targets`, so there is
   nothing to promote — this is a seeding value, not a migration. The staged
   `report_only → additive → full` path was the recommendation; `full` was chosen
   deliberately, accepting that `revokeGrant` gets its first production exercise
   across five projects at once.

   What that buys: deprovisioning actually works on day one. Under `additive` a
   departed employee keeps a live claim in all five projects — measured on the
   branch, `{departedUsers: 1, revokesReported: 1, revokesApplied: 0}` — because
   the `worker_status = 'Inactive'` tombstone only blocks a NEW grant.

   What it costs: an untested revoke path runs live. The mitigations that make it
   defensible are (a) the `uniqueTargets` fix, which is scoped to exactly this
   provider, so a bound group emptying still emits revokes; (b) `writeClaim`
   refusing to overwrite a `foreign` subtree, so a rollback cannot destroy a newer
   claim; and (c) the merge semantics now verified on hosted infrastructure.
6. Move `access_changes` writes to accompany each `applyGrant`, so a crash cannot
   leave external writes unlogged. Set `driftDetected` on apply failure.
7. Add an in-flight guard (advisory lock or a partial unique index on
   `status='running'`) before adding the second trigger — §5's `sync_run` + hourly
   pair can otherwise interleave on one target.
8. Alert on `last_status='failed'`, on `last_run_at` age, and on `unmappedUsers`
   climbing. Decide `access_changes` retention.

**Verify:** unit tests for the connector and `fetchActual` pagination; a
`report_only` run against one project asserting the expected `access_changes`
and **zero** external writes; one target promoted to `additive`, asserting the
`app_metadata` delta and that `provider`/`providers` survive; then **one
`full`-enforcement canary** exercising downgrade, removal, pagination failure,
partial failure and retry. `full` is where `revokeGrant` runs for the first time
ever — stopping the gate at `additive` proves only the half that cannot revoke.

### Phase 3 — enforcement

Modifies the **live** auth path of four production apps (§1.1) using plugins with
**no test coverage** (§1.2). Land per-plugin tests first.

1. Swap `IdpTokenPlugin` for `FleetworksClaimPlugin` alongside the existing
   `Database` provider (contract §6.5 disables IdpToken on all four).
   **Route the plugin's `onReject` somewhere real.** `resolveRolesFromPlugins`
   floors unconditionally at `DEFAULT_ROLE` (`orchestrator.ts:38`), so "stale
   rolodex claim" and "genuinely has no roles" both arrive at the middleware as
   `["org:viewer"]`. The plugin distinguishes them; the orchestrator cannot. If
   the rejection reason is not carried out to logging or metrics here, the
   distinction dies at the package boundary and staleness becomes undetectable
   in production — which is the failure the plugin was built to prevent.

   **This is a hard rollout gate, not a nicety.** The plugin's adversarial gate
   confirmed that a writer bug emitting `roles: []` fleet-wide would degrade
   every principal to `org:viewer` **silently**, and that *nothing else surfaces
   it* — the orchestrator's floor makes a mass outage indistinguishable from a
   correct mass downgrade. It fails closed, so it is safe rather than dangerous,
   but it is invisible. Wire `onReject` to a counter in all four apps **before**
   flipping the toggle, not after.
2. Configure `ROLE_MAP_ADMIN` etc. — and note that DNs cannot be expressed in a
   comma-split env var, so map on group **names**, or supply a `DbMappingLoader`.
3. Precedence is a **union**, floored at `org:viewer`. Local `org_members` grants
   survive a directory outage. The converse — that a local revocation cannot
   strip a directory-granted role — is the accepted cost, and needs an explicit
   local-deny mechanism if that becomes unacceptable.
4. **Rolodex must not be a target of its own reconciler**, or `access_bindings`
   mutation must require authority that is not JWT-derived — exactly what
   `cogs/packages/auth/src/types.ts:5-8` already prescribes. Designate the
   `org_members` row as root of trust and enforce it.
5. Break-glass moves **into this phase**, not after it.

### Phase 4 — UI, deprovisioning, migration

1. Bindings screen in rolodex: group → app → role → preview → confirm.
2. **Deprovisioning as a distinct deliverable**: session/refresh revocation, not
   just role removal (§3).
3. **Gate `routes/ldap.ts`.** Confirmed 2026-07-31: **no external PAT holder
   consumes `/api/ldap-sync-cache/*`** — the surface is too new. Every consumer
   is in-repo and on a Supabase JWT (web dashboard, mobile app,
   `scripts/smoke-authed.mjs`), so gating breaks nothing external. But it must
   happen in this order, or the gate is theatre:
   1. **Validate `service_accounts.role` against `VALID_ROLES`.**
      `service-accounts.ts:49` takes `role: z.string().optional()` into a plain
      text column, and `middleware.ts:107` casts it through as
      `roles: [sa.role as AuthRole]`, bypassing the `org:viewer` floor entirely.
      Any role gate is meaningless while PAT roles are caller-chosen strings.
   2. **Make `requireRole` hierarchy-aware** (or add `requireMinimumRole`).
      It is a flat exact-match (`role-guard.ts:12`) and resolution never expands
      downward, so `requireRole('org:contributor')` **403s an `org:admin`** whose
      principal is literally `['org:admin']`.
   3. Then gate at contributor-or-above.

   Related, and a prerequisite for (2): `apps/web/src/hooks/use-roles.ts:8-13`
   already implements a *ranked* `hasMinimumRole` while the API is flat — so UI
   and API authorization can silently diverge — and in that ranking **`ci:agent`
   (4) outranks `org:admin` (3)**, meaning the default service-account role is
   treated as super-admin by every UI check. Reconcile the two rankings.
4. Migrate existing yellow-pages admins and `groups` values: backfill directory
   groups and bindings **before** retiring the manual path, never after.

---

## 5. Decisions (settled 2026-07-31 with the user)

- **Reconcile on `sync_run` completion plus an hourly floor.** Requires the
  in-flight guard in Phase 2.7. The first draft's acceptance criterion ("a clean
  pass writes zero `access_changes` rows") is unmeetable — `noop_already_granted`
  is written per grant per run. Assert **zero rows with
  `disposition != 'noop_already_granted'`** instead.
- **One `fleetworks` platform org owns all five targets.** Note the tension: the
  binding routes don't filter on `org_id` at all (§1.3), so this decision leans on
  a boundary that Phase 1.2 must first make real.
- **Service accounts eligible for `ci:agent` only via a confirmed binding.**
  Two caveats discovered after the decision was made. First, it was justified by
  an approval control that does not exist — approval covers the group→role edge,
  never membership (§1.3) — so it holds only once Phase 0.2–0.4 land. Second,
  **`is_service_account` is never populated by any sync source** (§1.6), so the
  eligibility signal the decision names does not currently exist — it is a
  Workday column and Workday is a stub (§1.6). AD's `employeeType` **is**
  populated; key service accounts off that, or off an explicit rolodex-side flag.
- **`custom_access_token` hook stays off.** Push-only; rolodex out of the login
  path. Note §1.6 — the claim that it is currently off is unverified.

---

## 6. Non-goals

- Moving roles into Zitadel (`project_role_assertion` stays `false`).
- Replacing per-app auth or `org_members`.
- Enterprise inbound BYO-IdP (sub-project 5). It changes the trust story for
  asserted emails — an external IdP can assert an unverified one. Re-run the
  linking guard before any email join is exposed to it.
