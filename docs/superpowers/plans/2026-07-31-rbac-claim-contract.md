# RBAC claim contract — Phase 0.1

**Status:** decision doc, awaiting sign-off. No code. Blocks both execution lanes.

This is the artifact Phase 0.1 of `2026-07-31-central-rbac.md` calls for: the
exact definition of the claim rolodex writes and five apps read. Everything
downstream either writes or parses this, so it is specified before any of it.

---

## 1. The contract

```jsonc
// auth.users.raw_app_meta_data
{
  "provider":  "custom:fleetworks",   // Supabase-owned, never touched by us
  "providers": ["email", "custom:fleetworks"],
  "fleetworks": {                     // rolodex-owned subtree, sole writer
    "v": 1,
    "roles": ["org:contributor"],     // AuthRole[] only
    "source": "rolodex",
    "syncedAt": "2026-07-31T18:04:22Z"
  }
}
```

| field | rule |
|---|---|
| path | `app_metadata.fleetworks` |
| `v` | schema version, integer. Unknown version ⇒ **ignore the whole subtree** |
| `roles` | `AuthRole[]`. Anything not in the vocabulary is dropped, not passed through |
| `source` | provenance. Only `"rolodex"` is honoured today |
| `syncedAt` | RFC 3339 UTC. Absent ⇒ treat as stale |

**Sole writer: the rolodex reconcile loop.** No other process writes
`app_metadata.fleetworks`. Break-glass does not live here (§4).

**Replacement, not union.** `roles` is written wholesale each reconcile. An array
union can never revoke — this is the same defect as `enforcement: 'additive'`,
one layer up. The *subtree* is replaced; the surrounding `app_metadata` object is
merged, so `provider` / `providers` survive.

**Staleness.** A consumer that sees `syncedAt` older than **3× the reconcile
period** (3h at the agreed hourly floor) must **ignore the subtree entirely** and
fall back to local `org_members`. Note what this deliberately does *not* say: it
does not floor the principal at `org:viewer`. Flooring would strip a
locally-granted admin during a rolodex outage, which is exactly the failure the
union precedence exists to prevent.

---

## 2. Why not the two obvious paths

**`app_metadata.roles`** — the `SupabasePlugin` default (`supabase.ts:23`), so it
needs no configuration. Rejected: it is an unnamespaced bag with no owner. Under
`enforcement: 'full'` the reconciler would compute drift against roles it did not
grant and strip them. Ownership is the whole point of §2 of the plan.

**`app_metadata.groups`** — what yellow-pages reads today (`middleware.ts:93`).
Rejected: `groups` carries raw external group names and is load-bearing for
`write-guard.ts:35` (`groups.length > 0` **is** the write grant). Writing
directory data into it grants write to every member of any AD group. That is the
escalation Phase 1.2 exists to remove; it must not be re-created here.

---

## 3. This needs a new plugin, not configuration

`SupabasePlugin.resolve` is exactly `extractStrings(getNestedClaim(payload, roleClaim))`
(`supabase.ts:26-38`) — one dot-path in, strings out. Consequences:

- **It cannot read `syncedAt`.** Staleness is unenforceable through it. Pointing
  it at `app_metadata.fleetworks.roles` gets the roles and silently discards
  every other guarantee in §1.
- **Misconfiguring the path one level up fails silently and weirdly.** Aimed at
  `app_metadata.fleetworks`, `extractStrings` returns `Object.keys()`
  (`claim-utils.ts:26-28`) — `["v","roles","source","syncedAt"]` — as if they were
  group names.
- **A missing subtree yields `[]`**, which floors to `org:viewer`
  (`orchestrator.ts:37`). Indistinguishable from "correctly has no roles."
- **`AuthRole` passthrough is unmediated** (`mapping.ts:63-66`): any string that
  is literally `org:admin` becomes `org:admin` with no rule configured.

**Deliverable: `FleetworksClaimPlugin` in `@cogs/auth`** — roughly 30 lines,
implementing the existing `RoleProviderPlugin` interface so it drops into the
plugin arrays all four AuthRole apps already build. It must:

1. read the whole `app_metadata.fleetworks` subtree, not one path;
2. reject unknown `v`, missing `syncedAt`, stale `syncedAt`, wrong `source`;
3. validate `roles` against `VALID_ROLES` and **drop** anything else — never rely
   on mapper passthrough;
4. return `[]` on every rejection, and distinguish the reasons in a log line so
   "stale" is not silently identical to "no roles".

It ships with tests. Note that `@cogs/auth` currently has **no** per-plugin tests
at all (`packages/auth/test/` covers mapping, orchestrator, roles, verify,
impersonation only), so this is also the first one.

---

## 4. Break-glass does not live in the claim

`@cogs/auth`'s own guidance (`types.ts:5-8`) is that authority beyond the tenant
vocabulary is "resolved out-of-band and never encoded as a JWT-derived
`AuthRole`." A break-glass bit inside `app_metadata` contradicts that — it would
be JWT-derived by construction, and it would sit in the subtree the reconciler
overwrites.

**Break-glass is a server-side table lookup**, not a claim. This also resolves
the rolodex self-targeting problem (plan Phase 3.4): the root of trust is a row
the reconcile loop cannot write.

---

## 5. Consumers to update

Every app that reads roles must be updated in the same change set, because a
missing plugin silently degrades to `org:viewer` rather than failing:

| repo | file | today |
|---|---|---|
| rolodex | `apps/api/src/auth/middleware.ts:60-70` | `IdpToken` + `Database` |
| helmsman | `apps/api/src/auth/middleware.ts:55-60` | `IdpToken` + `Database` |
| warden | `apps/api/src/auth/middleware.ts:70-75` | `IdpToken` + `Database` |
| chorus | `apps/api/src/auth/middleware.ts:55-60` | `IdpToken` + `Database` |
| yellow-pages | `apps/api/src/auth/middleware.ts:91-99` | bespoke `claimsToRbac`, no plugins |

yellow-pages is the odd one out and is Phase 1's job.

**Also decide:** `IdpTokenPlugin` is enabled by default in all four and reads a
top-level `roles` claim (`config.ts:93`, `orchestrator.ts:72`). It is a second,
unnamespaced grant source that the reconciler neither writes nor can revoke.
Recommendation: **disable it** on these four unless something demonstrably needs
it. That is a behaviour change to a live auth path and wants its own verification.

---

## 6. Open for sign-off

1. Path `app_metadata.fleetworks` — agreed?
2. Staleness = 3× reconcile period, and stale means *ignore the subtree*, not
   *demote the user* — agreed?
3. Build `FleetworksClaimPlugin` rather than configure `SupabasePlugin` — this is
   the main cost added by this doc (new code + first per-plugin tests in cogs).
4. Break-glass as a table, not a claim — agreed?
5. Disable `IdpTokenPlugin` on the four apps — or keep it and accept a grant
   source the directory cannot revoke?
