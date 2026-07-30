# Fleetworks Auth Hub Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a self-hosted Zitadel identity hub and make yellow-pages offer "Sign in with Fleetworks" (dual-mode, verified-email account-linking) on both its web and mobile surfaces.

**Architecture:** Zitadel (self-hosted on Render + Postgres, `id.fleetworks.dev`) is the central OIDC IdP. A re-themed fork of Zitadel's first-party Login v2 (Next.js) is the branded hub UI at `account.fleetworks.dev`. yellow-pages' single Supabase project gets a first-class **Custom OIDC provider** (`custom:fleetworks`) pointed at Zitadel; web uses the `exchangeCodeForSession` callback, mobile (Expo) uses `signInWithOAuth` + `openAuthSessionAsync` + `setSession`. Supabase's automatic email-linking merges the federated identity into the existing yp user. Password login is untouched on every surface.

**Tech Stack:** Zitadel (Go) + Postgres on Render; Zitadel Login v2 (Next.js, MIT); Supabase Auth Custom OIDC + `@supabase/ssr` (web) + `@supabase/supabase-js` (Expo); Terraform (SES identity, Cloudflare DNS); AWS SES SMTP.

**Spec:** `docs/superpowers/specs/2026-07-29-fleetworks-auth-hub-pilot-design.md`

## Global Constraints

- Password (Phase-1) auth on yp web + mobile MUST remain functional and unchanged — federation is additive only. Rollback = disable the provider / hide the button.
- Account-linking is by **verified** email; a verified-email match must resolve to the SAME `auth.users` row, not a duplicate. This must be proven with a live smoke test (Supabase docs don't confirm the `email_verified`-claim check).
- `ZITADEL_MASTERKEY` is exactly 32 chars and immutable — generate once, store in Render secrets + a password manager; losing it loses all encrypted data.
- DNS for `id.fleetworks.dev` + `account.fleetworks.dev` uses the established explicit-CNAME→Render pattern (`proxied=false`) to override the `*.fleetworks.dev` Vercel wildcard; codify in Terraform (`api_record`-style) like the existing `<sub>-api` records.
- No secrets committed: Zitadel masterkey/DB creds/SMTP creds/OIDC client secret live in Render env + the gitignored infra tfvars, never in git.
- SES production access is granted (2026-07-29) — email delivers to any recipient.
- Supabase project ref for yellow-pages = `ndeubizireenktnvimiq`; its `sbp_` Management token is in `yellow-pages/apps/api/.env.local`.
- Mobile app id = `com.yellowpages.mobile`; Expo scheme registered in `app.config`. Device = iPhone 17 (`DEVICE_UDID=00008150-00041D1002D2401C`).

---

## File / component map

- `fleetworks-web/infra/` — Terraform: SES identity `auth.id.fleetworks.dev` (+ DKIM/MAILFROM/IAM SMTP) and the `id.` + `account.` Cloudflare CNAMEs → Render. (New infra root for the apex, mirroring the product-repo pattern.)
- **Render** — `zitadel` web service (Docker) + `zitadel-postgres`; `fleetworks-account` web service (the Login v2 fork).
- `fleetworks-account/` (new repo or `fleetworks-web/apps/account`) — forked + re-themed Zitadel Login v2.
- `cogs/packages/supabase-sync/` — extend to register a Custom OIDC provider + redirect-allow-list entries per project (reusable across all apps later).
- `yellow-pages/apps/web/src/app/auth/callback/route.ts` — web OIDC callback (`exchangeCodeForSession`).
- `yellow-pages/apps/web/src/app/login/login-form.tsx` — add "Sign in with Fleetworks" button.
- `yellow-pages/apps/mobile/lib/fleetworks-oauth.ts` — native `signInWithOAuth`+`openAuthSessionAsync`+`setSession` helper; `app/(auth)/login.tsx` — add the button; deep-link handler.

---

## Task 1: Zitadel SES email identity + hub DNS (Terraform)

**Files:**
- Create: `fleetworks-web/infra/{backend,providers,versions,ses,dns,iam,turnstile? (skip),outputs,variables}.tf` — copy the proven generic per-repo infra files from a product repo (e.g. `yellow-pages/infra/`), minus turnstile.
- Create: `fleetworks-web/infra/hub-dns.tf` — the `id.` + `account.` CNAMEs → Render (added after the Render services exist; see Task 2/4, but scaffold the resource now with a variable).
- Create: `fleetworks-web/infra/terraform.tfvars` (gitignored) — `domains = { "auth.id.fleetworks.dev" = { cloudflare_zone_id="7832c8a66e59e4e2676fc7d93d14d320", site_slug="fleetworks-hub", dmarc_rua="dmarc@fleetworks.dev" } }`.

**Interfaces:**
- Produces: SES SMTP creds for Zitadel (`terraform output smtp_usernames/smtp_passwords` keyed by `auth.id.fleetworks.dev`); the hub-DNS CNAME resources (targets filled in Task 2/4).

- [ ] **Step 1:** Copy the 8 generic `.tf` files from `yellow-pages/infra/` into `fleetworks-web/infra/`, delete `turnstile.tf` + its outputs, set `backend.tf` key = `fleetworks/hub/terraform.tfstate`. Add the tfvars above. Ensure `.gitignore` covers `infra/.terraform/`, `infra/*.tfvars`, `infra/*.tfstate*`.
- [ ] **Step 2:** Init + plan.
  Run: `cd fleetworks-web/infra && export AWS_PROFILE=workloom AWS_REGION=us-east-2; set -a; source /Volumes/dev-ssd/repos/personal/.envrc; set +a; export TF_VAR_cloudflare_api_token=$CLOUDFLARE_API_TOKEN TF_VAR_cloudflare_account_id=$CLOUDFLARE_ACCOUNT_ID; terraform init && terraform plan -out=hub.plan`
  Expected: creates the SES identity + DKIM (3 CNAME) + MAILFROM (MX+SPF) + DMARC + IAM SMTP user (~10 resources), 0 destroy.
- [ ] **Step 3:** Apply. Run: `terraform apply hub.plan`. Expected: `Apply complete`. Confirm DKIM verifies: `aws sesv2 get-email-identity --email-identity auth.id.fleetworks.dev --region us-east-2` → DkimAttributes.Status eventually SUCCESS.
- [ ] **Step 4:** Commit (infra .tf only; tfvars/state gitignored). `git add fleetworks-web/infra/*.tf && git commit -m "infra(hub): SES identity + DNS scaffold for id.fleetworks.dev"`

## Task 2: Deploy Zitadel on Render (+ h2c spike)

**Files:** Render dashboard/API (no repo files except a `deploy/zitadel/` notes doc). Optionally a `render.yaml` blueprint under a new/ops repo.

**Interfaces:** Produces a live Zitadel at `https://id.fleetworks.dev` serving `/.well-known/openid-configuration`.

- [ ] **Step 1 (SPIKE — do first, it gates the host choice):** Deploy Zitadel's official Docker image as a Render web service with a throwaway Render Postgres, env: `ZITADEL_MASTERKEY=<32 chars>`, `ZITADEL_EXTERNALDOMAIN=id.fleetworks.dev`, `ZITADEL_EXTERNALSECURE=true`, `ZITADEL_TLS_ENABLED=false` (Render terminates TLS), `ZITADEL_DATABASE_POSTGRES_DSN=<render pg url ?sslmode=require>`, `FirstInstance` admin env vars. Command: `start-from-init --masterkeyFromEnv`.
- [ ] **Step 2:** Attach `id.fleetworks.dev` (fill the Task 1 `hub-dns.tf` CNAME → the Render service's `onrender.com` host, `terraform apply`; register the custom domain on the Render service).
- [ ] **Step 3 (h2c verification — the known risk):** Load `https://id.fleetworks.dev/ui/console` and complete an admin login; exercise a gRPC-backed action (create a project). If you get blank/HTTP 400/500 with clean container logs → Render's edge isn't forwarding h2c. Verify: `curl -s -o /dev/null -w '%{http_code}' https://id.fleetworks.dev/.well-known/openid-configuration` = 200 AND the console actually functions.
  - If h2c FAILS: add a front proxy sidecar (Caddy with `reverse_proxy h2c://zitadel:8080`) as the Render service's server, or move Zitadel to a host that supports h2c (Fly.io/self-managed). Record the outcome in `deploy/zitadel/README.md`.
- [ ] **Step 4:** Once the console works end-to-end, re-provision against a persistent Render Postgres (not the throwaway), set autoDeploy off (pin the image tag), store masterkey in a password manager. Verify discovery doc lists `issuer: https://id.fleetworks.dev`.
- [ ] **Step 5:** Commit the `deploy/zitadel/README.md` runbook (image tag, env var list WITHOUT values, h2c outcome, upgrade = rerun `setup`).

## Task 3: Configure Zitadel — org, project, OIDC app, SES SMTP

**Files:** Zitadel Console/API; record IDs in `deploy/zitadel/README.md`.

**Interfaces:** Produces `FLEETWORKS_OIDC_CLIENT_ID` + `FLEETWORKS_OIDC_CLIENT_SECRET` (for Supabase) and a verified sending SMTP.

- [ ] **Step 1:** In Console, confirm org "Fleetworks" + create a Project "Fleetworks Suite".
- [ ] **Step 2:** Create an OIDC **Web** application "yellow-pages" (auth method: Code w/ client_secret, or PKCE). Redirect URI = the yp Supabase callback (read the exact value Supabase shows when creating the provider in Task 5 — typically `https://ndeubizireenktnvimiq.supabase.co/auth/v1/callback`). Scopes available: `openid profile email`. Capture client_id + client_secret.
- [ ] **Step 3:** Configure SES SMTP: `POST https://id.fleetworks.dev/admin/v1/email/smtp` (admin token) with `{ senderAddress:"no-reply@auth.id.fleetworks.dev", senderName:"Fleetworks", host:"email-smtp.us-east-2.amazonaws.com:587", user:<Task1 smtp_username>, password:<Task1 smtp_password>, tls:true }`, then activate it. If `SMTPSenderAddressMatchesInstanceDomain` blocks it, set that domain policy false.
- [ ] **Step 4 (verify):** Trigger a Zitadel email (invite a test user) → confirm delivery + SPF/DKIM/DMARC pass (check headers). 
- [ ] **Step 5 (verify email_verified claim):** With a test Zitadel user, hit the token/userinfo endpoint and confirm the ID token carries `email` + `email_verified: true`. Record the exact claim shape (gates Task 5's linking assumption).
- [ ] **Step 6:** Commit the runbook update (IDs, no secrets).

## Task 4: Fork + brand Zitadel Login v2 → account.fleetworks.dev

**Files:** Create repo/dir `fleetworks-account/` from Zitadel's Login v2 (`github.com/zitadel/zitadel/apps/login` or the standalone `zitadel/typescript`), Render web service, `account.` CNAME.

**Interfaces:** Produces the branded hub login UI at `https://account.fleetworks.dev` pointed at the Zitadel API.

- [ ] **Step 1:** Fork/clone Zitadel Login v2, point it at the Zitadel API (`ZITADEL_API_URL=https://id.fleetworks.dev` + a service-account PAT per its README), run locally against the live Zitadel, confirm login works.
- [ ] **Step 2:** Re-theme: Fleetworks gold `#a26000` primary + the Boxes mark logo, product name "Fleetworks". Use Zitadel's branding settings for the parts it supports; override the fork's theme tokens for the rest.
- [ ] **Step 3:** Deploy to Render as `fleetworks-account`; attach `account.fleetworks.dev` (fill the `account.` CNAME in `hub-dns.tf`, `terraform apply`; register the Render custom domain).
- [ ] **Step 4:** Point Zitadel's default login redirect at `account.fleetworks.dev` (instance login-policy / the Login v2 base URL) so OIDC auth requests render the branded UI.
- [ ] **Step 5 (verify):** From a browser, start an OIDC flow (Task 6 button, or a manual authorize URL) → it renders the branded `account.fleetworks.dev` login → sign in → returns to the RP. `/login` on account domain = 200, branded.
- [ ] **Step 6:** Commit the fork + a README documenting the upstream ref + the re-brand diff.

## Task 5: Register the Custom OIDC provider + redirect allow-list on yp's Supabase (reusable)

**Files:**
- Modify: `cogs/packages/supabase-sync/src/` — add a `syncCustomOidcProvider(entry, { issuer, clientId, clientSecret, acceptableClientIds })` that calls the Supabase Admin `customProviders` API, and extend the redirect-allow-list sync to include the mobile app-scheme.
- Test: `cogs/packages/supabase-sync/test/custom-oidc.test.ts`.

**Interfaces:**
- Consumes: yp ref `ndeubizireenktnvimiq` + `sbp_` token; Zitadel client_id/secret (Task 3).
- Produces: `custom:fleetworks` provider live on yp's project; `com.yellowpages.mobile://**` + the web callback in `uri_allow_list`.

- [ ] **Step 1 (failing test):** Write `custom-oidc.test.ts` asserting the sync builds the correct `createProvider` payload (`provider_type:'oidc'`, `identifier:'custom:fleetworks'`, `issuer:'https://id.fleetworks.dev'`, `scopes:['openid','profile','email']`, `acceptable_client_ids` present) and adds `com.yellowpages.mobile://**` to the allow-list. Run: `pnpm --filter @cogs/supabase-sync test custom-oidc` → FAIL.
- [ ] **Step 2:** Implement `syncCustomOidcProvider` using `supabase.auth.admin.customProviders.createProvider(...)` (or the equivalent Management endpoint if the admin-js API isn't available for the project's GoTrue version — verify against the live project first). Extend `uri_allow_list` handling. Run test → PASS.
- [ ] **Step 3 (apply to live yp project):** Run the sync against `ndeubizireenktnvimiq` (driver script, sbp_ token, real User-Agent). Verify via GET that the provider exists + the allow-list includes the web callback + `com.yellowpages.mobile://**`. Copy the provider's Callback URL back into the Zitadel app's redirect URIs (Task 3 Step 2) if not already exact.
- [ ] **Step 4:** Commit the supabase-sync change + tests (NOT the driver/secrets).

## Task 6: yellow-pages WEB — "Sign in with Fleetworks" + callback (dual-mode)

**Files:**
- Create: `yellow-pages/apps/web/src/app/auth/callback/route.ts` (OIDC code exchange).
- Modify: `yellow-pages/apps/web/src/app/login/login-form.tsx` (add the button).
- Modify: `yellow-pages/apps/web/src/proxy.ts` (ensure `/auth` public — already is from Phase 1).
- Test: `yellow-pages/apps/web/src/app/auth/callback/route.test.ts` (if the repo tests routes) OR a Playwright/manual e2e.

**Interfaces:**
- Consumes: `custom:fleetworks` provider (Task 5).
- Produces: a working web federated login on yp.

- [ ] **Step 1 (failing test):** Test that `GET /auth/callback?code=X` calls `exchangeCodeForSession` and redirects to `next||/dashboard`, and that a missing/invalid code redirects to `/login?error=...`. Run → FAIL.
- [ ] **Step 2:** Implement the callback route:
  ```ts
  export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = validNext(searchParams.get('next')) // startsWith('/') && !startsWith('//')
    if (code) {
      const supabase = await createSupabaseServerClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) return Response.redirect(new URL(next ?? '/dashboard', origin))
    }
    return Response.redirect(new URL('/login?error=oauth', origin))
  }
  ```
  Run test → PASS.
- [ ] **Step 3:** Add the button to `login-form.tsx` (below the password form, a divider "or"): `onClick={() => supabase.auth.signInWithOAuth({ provider: 'custom:fleetworks', options: { redirectTo: \`${location.origin}/auth/callback?next=/dashboard\` } })}`. Keep the entire password form unchanged.
- [ ] **Step 4:** Build + typecheck clean. Commit. Push to main (Vercel auto-deploys).
- [ ] **Step 5 (verify live):** On `https://yp.fleetworks.dev/login`: password login still works (regression); "Sign in with Fleetworks" → `account.fleetworks.dev` → authenticate → back to yp `/dashboard`, logged in.

## Task 7: yellow-pages MOBILE (Expo) — "Sign in with Fleetworks"

**Files:**
- Create: `yellow-pages/apps/mobile/lib/fleetworks-oauth.ts`.
- Modify: `yellow-pages/apps/mobile/app/(auth)/login.tsx` (button).
- Modify: `yellow-pages/apps/mobile/app.config.*` (confirm `scheme`), `lib/supabase.ts` (client opts).
- Add dep: `expo-web-browser`, `expo-auth-session` (via `npx expo install`).

**Interfaces:**
- Consumes: `custom:fleetworks` provider + the `com.yellowpages.mobile://**` allow-list entry (Task 5).
- Produces: native federated login on the yp Expo app.

- [ ] **Step 1:** Confirm the RN Supabase client sets `detectSessionInUrl: false`, `persistSession: true`, `storage: AsyncStorage`. Add `expo-web-browser` + `expo-auth-session` via `npx expo install`. Confirm `scheme` in `app.config`.
- [ ] **Step 2:** Implement `fleetworks-oauth.ts` (the documented Supabase Expo pattern):
  ```ts
  import { makeRedirectUri } from 'expo-auth-session'
  import * as QueryParams from 'expo-auth-session/build/QueryParams'
  import * as WebBrowser from 'expo-web-browser'
  import { supabase } from './supabase'
  WebBrowser.maybeCompleteAuthSession()
  const redirectTo = makeRedirectUri() // com.yellowpages.mobile://...
  export async function signInWithFleetworks() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:fleetworks', options: { redirectTo, skipBrowserRedirect: true } })
    if (error) throw error
    const res = await WebBrowser.openAuthSessionAsync(data.url!, redirectTo)
    if (res.type !== 'success') return
    const { params, errorCode } = QueryParams.getQueryParams(res.url)
    if (errorCode) throw new Error(errorCode)
    const { access_token, refresh_token } = params
    if (!access_token) throw new Error('no token')
    const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
    if (sErr) throw sErr
  }
  ```
- [ ] **Step 3:** Add the "Sign in with Fleetworks" button to `login.tsx` calling `signInWithFleetworks()` with try/catch/finally (mirror the Phase-1 mobile-parity error handling); password login unchanged.
- [ ] **Step 4:** typecheck clean. Commit.
- [ ] **Step 5 (device build + verify):** `cd apps/mobile && fastlane ios deploy_device` (the mobile-parity lane; `.env.local` present). On the iPhone 17: tap "Sign in with Fleetworks" → system browser opens `account.fleetworks.dev` → authenticate → returns to the app → logged in. Password login still works. (Verify the shipped bundle actually contains the new code, per the mobile-parity bundle-check discipline.)

## Task 8: Account-linking + cross-surface smoke test (the correctness gate)

**Files:** A documented manual/e2e checklist in `deploy/zitadel/README.md`; optionally a scripted check.

- [ ] **Step 1:** Create a yp password account with verified email `catesandrew+hublink@gmail.com` (sign up on yp web, confirm the email).
- [ ] **Step 2:** Create a Fleetworks (Zitadel) account with the SAME email, verified.
- [ ] **Step 3:** On yp web, "Sign in with Fleetworks" with that account. Verify via the Supabase dashboard/Admin API that there is exactly ONE `auth.users` row for that email with TWO linked identities (email + `custom:fleetworks`), NOT two users.
- [ ] **Step 4 (guard test):** Repeat with an UNVERIFIED Zitadel email matching a verified yp account → confirm it does NOT silently link (should require verification). If Supabase links on unverified email, add a `before-user-created`/`hook` mitigation and re-test. Record the actual behavior.
- [ ] **Step 5:** Cross-surface: sign in with the same Fleetworks account on the yp mobile app → resolves to the SAME yp user (check `sub`/user id). Document results.

## Task 9: Rollback drill + docs

- [ ] **Step 1:** Verify rollback: remove/disable the `custom:fleetworks` provider (or hide the buttons) → yp web + mobile password login unaffected. Re-enable.
- [ ] **Step 2:** Write `fleetworks-web/docs/superpowers/plans/`-adjacent runbook notes: how to add the provider to the next app (repeat Task 5–7), the h2c decision, the linking behavior found in Task 8, and the Zitadel upgrade procedure.
- [ ] **Step 3:** Update the project memory + spec status to "pilot implemented"; list the fast-follows (other 4 apps + apex, desktop, session SSO, central RBAC, BYO-IdP).

---

## Self-review notes
- **Spec coverage:** Zitadel deploy (T2) + config (T3) + SES (T1/T3) + hub UI fork (T4) + Supabase custom-OIDC + allow-list (T5) + web federation (T6) + mobile federation (T7) + verified-email linking gate (T8) + dual-mode/rollback (T6/T7/T9). Desktop is out of scope per the spec. ✅
- **Unverified-at-plan-time items carried as explicit verify steps, not assumptions:** Render h2c (T2.3), Zitadel `email_verified` claim shape (T3.5), Supabase auto-link honoring `email_verified` (T8.4), mobile `setSession`-vs-PKCE (T7.2 uses the documented `setSession` path), Supabase `customProviders` admin API availability for the project's GoTrue version (T5.2).
- **Sequencing:** T1→T2→T3 (Zitadel up + client creds) and T4 (hub UI) precede T5 (Supabase provider needs client_id/secret + callback URL), which precedes T6/T7 (apps need the provider), which precede T8 (linking test needs both surfaces). T8 is the correctness gate before declaring the pilot done.
