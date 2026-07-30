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

## Research findings (2026-07-30) — spec refinements (verified vs official docs)

- **Supabase federation mechanism = first-class Custom OIDC provider** (NOT SAML, NOT the legacy `external_*` keys). Configure per project via `supabase.auth.admin.customProviders.createProvider({ provider_type: 'oidc', identifier: 'custom:fleetworks', name: 'Fleetworks', issuer: 'https://id.fleetworks.dev', client_id, client_secret, scopes: ['openid','profile','email'], acceptable_client_ids: [<mobile client id>] })`. Sign-in: `signInWithOAuth({ provider: 'custom:fleetworks' })`. (SAML SSO is explicitly EXCLUDED from identity linking → would create a duplicate user; Custom OIDC is required.)
- **Auto-linking by verified email is Supabase's DEFAULT** (no `linkIdentity` code); it also prunes unconfirmed identities (takeover guard). ⚠️ Docs do NOT confirm it inspects Zitadel's `email_verified` claim before linking — must be proven with a smoke test (existing verified-email password user → federated login → same `auth.users` row).
- **Mobile flow correction:** Supabase's canonical Expo path uses **token-in-redirect-URL + `supabase.auth.setSession({ access_token, refresh_token })`** (via `expo-web-browser` `openAuthSessionAsync` + `expo-auth-session` `QueryParams.getQueryParams`), NOT `exchangeCodeForSession`. RN client needs `detectSessionInUrl: false` + AsyncStorage. (The `exchangeCodeForSession`+`flowType:'pkce'` variant is unverified on mobile — use the documented setSession path unless proven.)
- **Custom hub UI realization:** Zitadel ships a **first-party, self-hostable, MIT Login v2 (Next.js)** built on its Session API. **Recommended:** fork/theme that for `account.fleetworks.dev` rather than hand-rolling Session-API calls (GetAuthRequest → CreateSession → CreateCallback). Same "custom branded UI on apex" outcome, far less effort + fully supported. (Decision pending — see below.)
- **Zitadel deployment risk (h2c):** Zitadel uses HTTP/2 for gRPC; a TLS-terminating proxy must forward **h2c**. Render-edge h2c support is UNCONFIRMED → Task 1 must spike this; fallback = a self-managed proxy sidecar (Caddy/nginx h2c) or a different host. Config: `ZITADEL_MASTERKEY` (exactly 32 chars, immutable), `ExternalDomain=id.fleetworks.dev`, `ExternalSecure=true`, TLS mode external/disabled, Postgres via DSN; bootstrap via `FirstInstance` env; SES SMTP via `POST /admin/v1/email/smtp`.

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
- The custom, branded hub login/signup UI at `account.fleetworks.dev` = a **fork of Zitadel's first-party Login v2 (Next.js, MIT)**, re-themed with Fleetworks branding (gold Boxes mark/colors) and self-hosted (its own Render service, or under the apex domain). It already implements the Session-API login/signup/verify/reset/MFA flows against Zitadel; we own + brand it but don't rebuild the flows. This one hub UI is the login surface for **all** client surfaces (opened in the system browser on native). [DECIDED 2026-07-30]
- yellow-pages gains a "Sign in with Fleetworks" (generic-OIDC) option next to its existing password login, on **both its web and its mobile (Expo) surface**. Password login untouched on both.
- Auto-link a federated identity to an existing yp account by **verified** email; provision a new yp user otherwise. Because web + mobile + desktop share ONE yp Supabase project, linking is per-Supabase-user and identical regardless of which client initiated it.
- Prove the full round-trip e2e on yellow-pages, **web and mobile**.

**Non-goals (deferred to later sub-projects)**
- The other 4 apps + apex federation (#2); cross-app session SSO (#3); central RBAC/role claims (#4); enterprise BYO-IdP (#5); full account-hub/app-launcher UI (#6).
- Migrating existing Phase-1 users into Zitadel en masse (linking happens lazily on first federated login).
- **Desktop (Tauri) federation** — acknowledged as a third surface (same OIDC-provider config on the shared Supabase project; native system-browser + deep-link/loopback flow like mobile). Sequenced as a fast-follow after web+mobile prove out, unless pulled in.

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

## Client surfaces (critical — each app has three)

Every fleetworks app ships **web (Next SSR), mobile (Expo, native `@supabase/supabase-js`), and desktop (Tauri)** — all three talk to the **same single Supabase project** for that app. Consequences:
- The Zitadel generic-OIDC provider is configured **once on the app's Supabase project** and is therefore available to all three clients.
- Account-linking-by-verified-email happens at the Supabase-user level, so it's identical no matter which surface a user first federates from — one yp account, reachable from web, phone, or desktop.
- The federation *interaction* differs by surface: web = server-side redirect; native (mobile/desktop) = OAuth **PKCE** in the system browser + **deep-link** return. Mobile today confirms email in-browser and deferred the deep-link screen — federation *requires* wiring that native redirect return.

## Data flow — login via the hub

**Web (yp Next app):**
1. yp `/login` → "Sign in with Fleetworks" → GoTrue OIDC `authorize` → redirect to the hub.
2. Auth at `account.fleetworks.dev` (apex UI → Zitadel Session API). New users can self-register here.
3. Zitadel issues an OIDC `code` → yp GoTrue callback → GoTrue exchanges tokens, reads `sub` + verified `email` + `name`.
4. GoTrue links to the existing yp user by verified email (or provisions one), mints the yp Supabase session → user lands in yp.

**Mobile (yp Expo app):**
1. yp mobile `login` → "Sign in with Fleetworks" → `supabase.auth.signInWithOAuth({ provider: <zitadel-oidc>, options: { redirectTo: '<app-scheme>://auth/callback', skipBrowserRedirect: true } })`.
2. Open the returned URL in the system browser (`expo-web-browser`) → `account.fleetworks.dev` login (same hub UI) → Zitadel.
3. Zitadel redirects to `<app-scheme>://auth/callback?code=…` → the app's **deep-link handler** hands the code to `supabase.auth.exchangeCodeForSession` (**PKCE**) → same account-linking → native session.
   - Requires: `expo-web-browser`/deep-link handling added (the piece mobile-parity deferred); the `<app-scheme>://auth/callback` URL added to the app's Supabase **redirect allow-list** (cogs-managed via supabase-sync).

**Desktop (Tauri):** same native PKCE pattern (system browser + Tauri deep-link/loopback callback). Deferred to fast-follow.

Password-login flow is unchanged on every surface (no hub involvement).

## Account linking rules

- Link a federated identity to an existing yp user **only when both the incoming (Zitadel) email and the existing yp email are verified**. Store the Zitadel `sub` as the linked identity.
- Incoming email matches an **unverified** yp account → require verification before linking (takeover guard); do not auto-link.
- No match → provision a new yp user from the verified claims.
- yp has no app-level RBAC provisioning trigger (unlike rolodex), so no extra provisioning hook needed for the pilot.

## Deployment / infra

- Zitadel via its official Docker image on Render (web service) + Render Postgres (or external Postgres). Domain `id.fleetworks.dev` using the established explicit-CNAME → Render pattern (proxied=false) so it overrides the `*.fleetworks.dev` Vercel wildcard and Zitadel serves its own TLS.
- Secrets: Zitadel masterkey, DB creds, SMTP creds — Render env (not committed). Zitadel admin bootstrap via its init config.
- SES: a `auth.id.fleetworks.dev` SES identity + DKIM + IAM SMTP user, provisioned by the same per-repo Terraform infra pattern (either a new `hub`/apex `infra/` root or a small addition) so Zitadel's verification/reset/MFA mail authenticates (SPF/DKIM/DMARC).
- Zitadel config: create org "Fleetworks", a Project, the yp OIDC app, and the apex account-UI app; enable self-service registration; brand the (fallback) hosted pages even though apex drives the custom UI.
  - **Redirect topology (important):** Supabase (yp's GoTrue) is the single OIDC client of Zitadel, so Zitadel's `redirect_uri` = the yp **GoTrue callback URL only** — shared by web *and* native. The native **app-scheme** (`<app-scheme>://auth/callback`) is a Supabase↔app concern, added to the yp Supabase **redirect allow-list** (cogs supabase-sync). So mobile support needs **no extra Zitadel client** — only the Supabase allow-list entry + the app-side deep-link/PKCE wiring.
- Mobile deps: add `expo-web-browser` (and deep-link config) to yp's `apps/mobile`; the existing native `@supabase/supabase-js` client gains the `signInWithOAuth` + `exchangeCodeForSession` path.

## Dual-mode guarantee & rollback

- The OIDC provider on yp is purely additive; the Phase-1 password login is unchanged and remains the primary path. If the hub is unavailable, users still log in with their yp password.
- Rollback for the pilot = hide the "Sign in with Fleetworks" button / disable the GoTrue OIDC provider. No Phase-1 regression possible.

## Testing / acceptance

(SES production access was granted 2026-07-29 — email now delivers to any recipient, not just the verified `+smoketest` address.)
- **Web e2e:** create a Fleetworks account at `account.fleetworks.dev` → on yp web click "Sign in with Fleetworks" → authenticate → land logged-in in yp.
- **Mobile e2e (on device):** yp Expo app → "Sign in with Fleetworks" → system browser opens `account.fleetworks.dev` → authenticate → deep-link returns to the app → native session established → land logged-in. Verify on the iPhone 17 (the mobile-parity canary device).
- **Cross-surface identity:** the same Fleetworks account logs into yp from both web and mobile and resolves to the SAME yp Supabase user.
- Existing-email link: a yp password user with verified email `X`, then a Fleetworks account with the same verified `X` → federated login lands in the SAME yp account (not a duplicate).
- Verified-email guard: unverified match does NOT auto-link.
- Regression: yp password login + signup + device-login unaffected on web AND mobile.
- Zitadel email deliverability: verification/reset mail from `auth.id.fleetworks.dev` passes SPF/DKIM/DMARC.

## Open questions to resolve during planning (verify against Zitadel + Supabase docs)

- Zitadel **Session API / Login-UI-v2** exact surface + effort for the custom apex UI (login, signup, email verification, password reset; MFA deferred).
- Supabase GoTrue **generic-OIDC provider** config + the precise behavior/settings for **identity linking by verified email** (confirm it links rather than erroring on email collision, and honors the verified-only guard).
- Zitadel **SMTP → SES** configuration + whether to reuse an existing SES identity or add `auth.id.fleetworks.dev`.
- Zitadel on Render: single-service viability, Postgres sizing, masterkey/secret management, backup/restore, and the availability/security posture of running our primary IdP ourselves.
- **Mobile native federation:** `supabase.auth.signInWithOAuth` generic-OIDC + `expo-web-browser` + deep-link (`<app-scheme>://auth/callback`) return + `exchangeCodeForSession` PKCE — confirm the exact Expo/Supabase wiring, add the app-scheme redirect URL to the yp Supabase **redirect allow-list** (via cogs supabase-sync), and reconcile with the deep-link handling the mobile-parity work deferred. Confirm the hub UI at `account.fleetworks.dev` renders correctly inside the mobile system browser.
- **Desktop (Tauri):** confirm the deep-link/loopback callback approach + whether it joins the pilot or fast-follows.

## Risks

- Self-hosting the primary IdP concentrates availability/breach risk across all apps (accepted; mitigated by dual-mode — password login survives a hub outage in Phase 1).
- Custom login UI handling the credential-entry UX is security-sensitive; mitigated by relaying to Zitadel's Session API (apex never stores/validates passwords itself).
