# Fleetworks Auth — Phase 2, Sub-project 1: Hub foundation + yellow-pages pilot

**Status:** Design approved (2026-07-29). Next: implementation plan (writing-plans).
**Scope:** ONE sub-project of Phase 2. See "Phase 2 decomposition" for the rest (out of scope here).

## Background

Phase 1 (done): all 5 fleetworks product apps (yellow-pages, warden, helmsman, rolodex,
chorus) ship self-serve auth on their **own isolated Supabase (GoTrue) SSR** projects;
apex (fleetworks-web) is marketing-only. Each app's GoTrue was deliberately kept so it
*can* later federate to a central IdP.

Phase 2 goal (all four wanted): a shared **Fleetworks account hub** giving (1) one shared
identity across apps + apex, (2) session SSO, (3) central user/role/org admin, and (4)
inbound enterprise BYO-IdP — while every app retains the ability to use **either** its own
per-app auth **or** the shared hub (multi-IdP coexistence). Federation is always *added*
to an app, never replaces its password login.

**Central IdP decision:** Zitadel, **self-hosted on Render** (Apache-2.0, no per-user fees;
first-class orgs/projects/roles; OIDC **and** SAML provider; inbound IdP federation).
Rejected: a dedicated Supabase instance as the hub — GoTrue is a relying party, not an
OIDC/SAML *provider*, so Supabase cannot BE the IdP other Supabases federate to. Managed
alternatives (Cognito/Zitadel-Cloud/WorkOS) rejected for per-user cost + (Cognito) weak
central org/role modeling; ops/security burden of self-hosting accepted.

## Phase 2 decomposition (context; only #1 is in scope here)

1. **Hub foundation + 1 pilot federation (THIS SPEC)** — deploy Zitadel; wire yellow-pages
   to offer "Sign in with Fleetworks" alongside its password login (dual-mode, verified-email link).
2. Roll federation to the other 4 apps + apex.
3. Cross-subdomain session SSO.
4. Central org/role/RBAC (role claims → apps; reconcile each app's local RBAC).
5. Enterprise BYO-IdP (inbound SAML/OIDC in Zitadel).
6. Full account hub UI on apex (account.fleetworks.dev) — profile/security/app launcher.

## Goals & non-goals (this sub-project)

**Goals**
- Stand up Zitadel self-hosted on Render at `id.fleetworks.dev`, SES-backed email, as the Fleetworks IdP.
- A custom, branded login/signup UI on apex at `account.fleetworks.dev`, built against Zitadel's Session API (apex relays credentials; Zitadel owns password hashing/MFA/policy — apex stores no passwords).
- yellow-pages gains a "Sign in with Fleetworks" (generic-OIDC) option next to its existing password login. Password login untouched.
- Auto-link a federated identity to an existing yp account by **verified** email; provision a new yp user otherwise.
- Prove the full round-trip e2e on yellow-pages only.

**Non-goals (deferred to later sub-projects)**
- The other 4 apps + apex federation (#2); cross-app session SSO (#3); central RBAC/role claims (#4); enterprise BYO-IdP (#5); full account-hub/app-launcher UI (#6).
- Migrating existing Phase-1 users into Zitadel en masse (linking happens lazily on first federated login).

## Architecture

```
   account.fleetworks.dev (apex custom UI, Zitadel Session API)
             │  (login/signup UX; relays creds)
             ▼
   id.fleetworks.dev  ── Zitadel (Render + Postgres) ── SES SMTP (auth.id.fleetworks.dev)
        IdP / OIDC provider / user store
             ▲  OIDC (authorize/code/token)
             │  "Sign in with Fleetworks"
   yp.fleetworks.dev ── Supabase GoTrue (unchanged) + generic-OIDC provider = Zitadel
        password login (Phase 1) ── still works
```

- **Zitadel** = source of the Fleetworks identity. Org "Fleetworks"; a Project; one OIDC App (client) for yellow-pages' GoTrue (client_id/secret; redirect URI = yp GoTrue callback). SMTP → SES.
- **Apex account UI** = a Zitadel client too (for its own session), driving the Session API for the login/signup UX. Branded (Fleetworks gold Boxes mark).
- **yellow-pages GoTrue** = adds Zitadel as a generic-OIDC provider; identity-linking-by-verified-email enabled.

## Data flow — login via the hub

1. yp `/login` → "Sign in with Fleetworks" → GoTrue OIDC `authorize` → redirect to the hub.
2. Auth happens at `account.fleetworks.dev` (apex UI → Zitadel Session API). New users can self-register here.
3. Zitadel issues an OIDC `code` → yp GoTrue callback → GoTrue exchanges for tokens, reads `sub` + verified `email` + `name`.
4. GoTrue links to the existing yp user by verified email (or provisions a new one), mints the yp Supabase session → user lands in yp.

Password-login flow is unchanged (no hub involvement).

## Account linking rules

- Link a federated identity to an existing yp user **only when both the incoming (Zitadel) email and the existing yp email are verified**. Store the Zitadel `sub` as the linked identity.
- Incoming email matches an **unverified** yp account → require verification before linking (takeover guard); do not auto-link.
- No match → provision a new yp user from the verified claims.
- yp has no app-level RBAC provisioning trigger (unlike rolodex), so no extra provisioning hook needed for the pilot.

## Deployment / infra

- Zitadel via its official Docker image on Render (web service) + Render Postgres (or external Postgres). Domain `id.fleetworks.dev` using the established explicit-CNAME → Render pattern (proxied=false) so it overrides the `*.fleetworks.dev` Vercel wildcard and Zitadel serves its own TLS.
- Secrets: Zitadel masterkey, DB creds, SMTP creds — Render env (not committed). Zitadel admin bootstrap via its init config.
- SES: a `auth.id.fleetworks.dev` SES identity + DKIM + IAM SMTP user, provisioned by the same per-repo Terraform infra pattern (either a new `hub`/apex `infra/` root or a small addition) so Zitadel's verification/reset/MFA mail authenticates (SPF/DKIM/DMARC).
- Zitadel config: create org "Fleetworks", a Project, the yp OIDC app (redirect URIs), and the apex account-UI app; enable self-service registration; brand the (fallback) hosted pages even though apex drives the custom UI.

## Dual-mode guarantee & rollback

- The OIDC provider on yp is purely additive; the Phase-1 password login is unchanged and remains the primary path. If the hub is unavailable, users still log in with their yp password.
- Rollback for the pilot = hide the "Sign in with Fleetworks" button / disable the GoTrue OIDC provider. No Phase-1 regression possible.

## Testing / acceptance

- e2e (SES sandbox → verified recipient only until AWS prod grant): create a Fleetworks account at `account.fleetworks.dev` → on yp click "Sign in with Fleetworks" → authenticate → land logged-in in yp.
- Existing-email link: a yp password user with verified email `X`, then a Fleetworks account with the same verified `X` → federated login lands in the SAME yp account (not a duplicate).
- Verified-email guard: unverified match does NOT auto-link.
- Regression: yp password login + signup + device-login unaffected.
- Zitadel email deliverability: verification/reset mail from `auth.id.fleetworks.dev` passes SPF/DKIM/DMARC.

## Open questions to resolve during planning (verify against Zitadel + Supabase docs)

- Zitadel **Session API / Login-UI-v2** exact surface + effort for the custom apex UI (login, signup, email verification, password reset; MFA deferred).
- Supabase GoTrue **generic-OIDC provider** config + the precise behavior/settings for **identity linking by verified email** (confirm it links rather than erroring on email collision, and honors the verified-only guard).
- Zitadel **SMTP → SES** configuration + whether to reuse an existing SES identity or add `auth.id.fleetworks.dev`.
- Zitadel on Render: single-service viability, Postgres sizing, masterkey/secret management, backup/restore, and the availability/security posture of running our primary IdP ourselves.

## Risks

- Self-hosting the primary IdP concentrates availability/breach risk across all apps (accepted; mitigated by dual-mode — password login survives a hub outage in Phase 1).
- Custom login UI handling the credential-entry UX is security-sensitive; mitigated by relaying to Zitadel's Session API (apex never stores/validates passwords itself).
