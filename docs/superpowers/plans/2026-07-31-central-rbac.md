# Central RBAC — sub-project 4

**Status:** plan, not executed. Written 2026-07-31 after reading the five repos'
authorization code, `@cogs/auth`, and rolodex's directory + access schema.

Prereqs done: Phase 1 auth (per-app Supabase), Phase 2 sub-projects 1 & 2 (the
Zitadel hub + "Sign in with Fleetworks" on all five apps). See
`2026-07-30-fleetworks-auth-hub-pilot.md`.

---

## 1. What exists today (measured, not assumed)

### 1.1 Two incompatible authorization models

| | yellow-pages | helmsman / rolodex / warden / chorus |
|---|---|---|
| Principal shape | `{ isAdmin: boolean, groups: string[] }` | `AuthRole[]` |
| Source | Supabase `app_metadata.role` / `.groups` | `org_members.role` column |
| Vocabulary | free-form group strings + an admin bit | `org:admin` \| `org:contributor` \| `org:viewer` \| `ci:agent` |
| Default | no groups ⇒ `requireWriteAccess` 403s | `.default('org:viewer')` |
| Where enforced | `apps/api/src/auth/middleware.ts` + `write-guard.ts` | per-app middleware |

Both now *verify* tokens through `@cogs/auth`'s `verifyToken`. Neither uses its
role machinery.

### 1.2 `@cogs/auth` already has the whole resolution engine — unused

`packages/auth/src/plugins/`:

- `RoleProviderPlugin` — `resolve(ctx) => Promise<string[]>` of **raw external
  group strings**. Mapping to internal roles happens later, deliberately.
- Implementations: `IdpTokenPlugin` (on by default), `DatabasePlugin` (on when a
  `DbLookupFn` is injected), `UserinfoPlugin`, `SupabasePlugin`, `LdapPlugin` —
  the last three opt-in.
- `LdapPlugin` takes an injected `LdapClient { fetchGroups(userId): Promise<string[]> }`.
  The package has **no `ldapjs` dependency** — the consumer supplies the client.
  That injection point is the seam this whole plan hangs on.
- `resolveRolesFromPlugins(plugins, ctx, mapper)` — runs plugins in parallel,
  unions groups, maps, floors at `org:viewer`.
- `RoleMappingService` — glob (`*`) matching from external group ⇒ `AuthRole`.
  Rules come from `ROLE_MAP_*` env **and** an optional injected
  `DbMappingLoader(orgId)`; DB rules take precedence over env rules. Any group
  string that is already a valid `AuthRole` passes straight through.

So the enforcement plane is written and tested. Nothing calls it.

### 1.3 Rolodex already *is* the directory and the provisioning engine

Rolodex's CLAUDE.md calls it an "LDAP Sync Cache … read-only access to Active
Directory and Workday user/group data". The schema goes further than that:

**Directory (sync'd from AD + Workday via `sync_sources` / `sync_runs`):**

- `directory_users` — 40+ columns incl. `mail`, `work_email`,
  `sam_account_name`, `dss_username`, `distinguished_name`, `object_guid`,
  `employee_number`, `manager`, `cost_center_unique_id`, `is_service_account`,
  and `yellowpages_service_id` (it already cross-links to yellow-pages).
- `directory_groups` — `name`, `distinguished_name`, `category`, `managed_by`,
  `owner_user_id` / `owner_group_id` / `owner_object_class`, plus its own
  `yellowpages_service_id`.
- `group_members` — `group_id` × `user_id`.

**Access provisioning (migration `0003_careful_madame_hydra.sql`):**

- `access_targets` — `provider`, `name`, `config`, `secret_enc`, `active`,
  `last_run_at`, `last_status`. A downstream system to provision into.
- `access_bindings` — `rolodex_group_id` → (`target_id`, `external_target`,
  `role`), with `previewed`, `created_by`, `confirmed_by`, `confirmed_at`.
  **This is already a group→role mapping table with two-phase approval.**
- `access_changes` — per-run ledger: `disposition`, `external_principal`,
  `external_target`, `role`, `applied`, `detail`.
- `user_external_identities` — `user_id` × `provider` × `external_login`.

**API surface already shipped:** `/api/access/targets`,
`/api/access/targets/{id}/reconcile`, `/api/access/targets/{id}/runs`,
`/api/access/bindings`, `/api/access/bindings/{id}/confirm`,
`/api/access/identities/import`, plus `/internal/access/reconcile`.

The central RBAC control plane does not need to be invented. It needs one new
`provider` value and one missing read path.

### 1.4 The gaps

1. **No reverse lookup.** `/api/ldap-sync-cache/group/{name}` is group→members.
   There is no members→groups and no `user-by-email`. Every lookup key
   (`objectGUID`, `employee-number`, `dss-username`, `distinguishedname`,
   `yellowpages-service-id`) is an *enterprise* key. The hub asserts an **email**.
2. **Zitadel is deliberately not the role store.** `infra/zitadel.tf` sets
   `project_role_assertion = false` and declares no `zitadel_project_role` /
   `_grant` resources. Correct — keep it authentication-only.
3. **Federated claims land in the wrong bag.** Supabase writes IdP claims to
   `user_metadata`; yp's `claimsToRbac` reads `app_metadata`. For hub-sourced
   users it reads an empty object, which is why every federated sign-in lands as
   "no groups" and gets 403'd by `requireWriteAccess`.
4. **`hook_custom_access_token_enabled = false`** on yp. The claim-injection
   seam exists and is switched off.

---

## 2. Design

**Rolodex is the RBAC control plane. `@cogs/auth` is the enforcement plane.
Supabase is the transport. Zitadel stays authentication-only.**

The identity join is **verified email → `directory_users.mail` / `.work_email`**.
That works precisely because the hub refuses to authenticate an unverified-email
user at all (proven in sub-project 1), so a verified email off a Fleetworks token
is a trustworthy directory key.

Delivery is **push-primary, pull-optional**:

- **Push (primary).** A Fleetworks app becomes an `access_target` with
  `provider = 'fleetworks'`. The existing reconcile loop resolves each binding's
  group to its members, maps them to `AuthRole`s, and writes
  `app_metadata.roles` on that app's Supabase project via the admin API. Every
  write lands in `access_changes`. This reuses the preview/confirm approval and
  the audit ledger unchanged, adds **zero** login-path latency, and creates no
  runtime dependency on rolodex being reachable during sign-in.
- **Pull (opt-in, per app).** `LdapPlugin` with a rolodex-backed `LdapClient`,
  for apps that need same-request freshness. Fails closed to `org:viewer` on
  rolodex being down — the plugin already swallows errors and returns `[]`.

Push is primary because revocation lag is bounded by JWT TTL plus reconcile
period, both tunable, whereas pull puts rolodex in the critical path of every
request in the fleet. Ship push; add pull only where a concrete requirement
demands it.

---

## 3. Phases

### Phase 0 — unify the vocabulary (blocking prerequisite)

yp cannot consume `AuthRole` while its guard reads `isAdmin`/`groups`.

1. In yp, derive `AuthRole[]` alongside the legacy shape: `org:admin` ⇒
   `isAdmin: true`; any `org:contributor` ⇒ write access. Keep `groups` as the
   raw external strings for display.
2. Read from **both** `app_metadata` and `user_metadata` (app_metadata wins) so
   federated users stop landing role-less. Regression test for the hub-sourced
   shape specifically.
3. Leave `requireWriteAccess`'s default-deny intact — `org:viewer` is a read
   role, and that is the same policy under a new name.

**Verify:** a federated yp sign-in with no directory groups still 403s on write;
one with a contributor binding 200s. Same evidence shape as the write-hole fix.

### Phase 1 — rolodex reverse lookup

1. `GET /api/ldap-sync-cache/user-by-email/{email}` — matches `mail` **or**
   `work_email`, case-insensitively. Index both.
2. `GET /api/ldap-sync-cache/user/{id}/groups` — the members→groups direction,
   returning group `name` + `distinguished_name`.
3. Decide the collision policy up front: two `directory_users` rows sharing an
   email must **fail closed** (return none), never pick one arbitrarily.

**Verify:** contract tests in `openapi-contract.test.ts`; a fixture with a
duplicate-email pair asserting the fail-closed branch.

### Phase 2 — the `fleetworks` access provider

1. Add `provider = 'fleetworks'` to `access_targets`. `config` carries the
   Supabase project ref and the app slug; `secret_enc` carries that project's
   secret key (same key class `register-fleetworks-provider.mjs` already
   reveals via the Management API).
2. Seed one target per app: yellow-pages, helmsman, rolodex, warden, chorus —
   all owned by the single `fleetworks` platform org (§4).
3. `access_bindings.role` for these targets is constrained to the `AuthRole`
   vocabulary. Bindings stay group-scoped — never per-user. Service-account
   rows are eligible for `ci:agent` only via an explicitly confirmed binding.
4. Reconcile: for each active binding, expand `group_members` → `directory_users`
   → email → that project's `auth.users` row; compute the union of roles; write
   `app_metadata.roles`. **Merge, never replace** `raw_app_meta_data` — the
   `provider`/`providers` keys must survive (the same bug already fixed once in
   yp's `admin-users.ts`).
5. Write every add/remove/no-op to `access_changes` with `applied`.
6. Trigger on `sync_run` completion plus an hourly floor (§4). A clean hourly
   pass must write zero `access_changes` rows.

**Verify:** dry-run (`previewed`) against a real project produces the expected
`access_changes` rows and writes nothing. Then confirm one binding and assert the
`app_metadata` delta plus intact `providers`.

### Phase 3 — enforcement through `@cogs/auth`

1. Each app builds its provider set with `createRoleProviders({ supabase: true },
   { dbLookup })` — `SupabasePlugin` reads the pushed `app_metadata`,
   `DatabasePlugin` keeps `org_members` as the local override.
2. `RoleMappingService` gets a `DbMappingLoader` so per-org rules can come from
   the DB later; until then `ROLE_MAP_*` env carries the static globs (e.g.
   `ROLE_MAP_ORG_ADMIN=CN=Fleetworks-Admins,*`).
3. Precedence, stated explicitly and tested: local `org_members` grant ∪
   directory-derived roles, floored at `org:viewer`. Union, not override —
   a directory outage must not strip a locally-granted admin.

**Verify:** per-app middleware tests asserting each precedence branch, including
directory-down.

### Phase 4 — UI and break-glass

1. Rolodex gains a bindings screen: pick group → pick app → pick role → preview →
   confirm. This is the "adjust groups in UI, tied to rolodex" the user asked for,
   and it lands on the API that already exists.
2. **Break-glass stays out of the directory.** Platform staff ("god mode") is
   resolved server-side per `@cogs/auth`'s own note that such authority is
   "resolved out-of-band and never encoded as a JWT-derived `AuthRole`". yp's
   `/admin/users` remains the manual path; keep its no-self-demotion guardrail.
3. Retire yp's direct `app_metadata.groups` editing once Phase 2 owns that field,
   or the reconcile loop will fight the admin UI. Until then, `groups` stay
   read-only in the UI exactly as they are now.

---

## 4. Decisions (settled 2026-07-31)

- **Reconcile cadence: on `sync_run` completion, plus an hourly floor.** The
  event edge propagates a real HR change within minutes; the hourly sweep exists
  so a failed or silently-stalled sync source cannot freeze grants indefinitely.
  Worst-case revocation lag = 1h + JWT TTL. Both are tunable; neither is
  unbounded. The hourly run must be a no-op when nothing changed — assert that
  it writes zero `access_changes` rows on a clean pass.
- **Tenancy: one platform org owns all five targets.** A single `fleetworks` org
  row in rolodex. There is exactly one directory, one admin group, and one audit
  trail today, and yp has no org concept at all — inventing five tenants would
  fabricate an axis that does not exist and split `access_changes` five ways.
  `org_id` stays a real tenant boundary for when multi-tenancy actually arrives.
- **Service accounts: eligible, never automatic.** A `directory_users` row with
  `is_service_account` may receive `ci:agent`, but only through an ordinary
  `access_binding` that someone previewed and confirmed. No implicit grant off
  the flag. Machine authority across five apps is exactly the case the two-phase
  approval exists for. `service_account_environment` is advisory metadata shown
  in the bindings UI, not an input to the grant.
- **`custom_access_token` hook stays OFF.** Push-only delivery. Rolodex is
  deliberately absent from the login path: if it is down, people still sign in
  with their last-known roles rather than being locked out fleet-wide. Revisit
  only if measured push-staleness proves unacceptable — and if so, pilot on yp
  alone with an explicit test for the hook-errors-block-sign-in failure mode.

---

## 5. Non-goals

- Moving roles into Zitadel (`project_role_assertion` stays `false`).
- Replacing per-app auth or `org_members`.
- Enterprise inbound BYO-IdP — that is sub-project 5, and it changes the
  trust story for asserted emails (an external IdP *can* assert an unverified
  one). Re-run the linking guard before Phase 1's email join is exposed to it.
