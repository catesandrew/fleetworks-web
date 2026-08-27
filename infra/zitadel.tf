# Zitadel's own configuration plane as IaC.
#
# The server itself (container image, Postgres, custom domain) is provisioned on
# Fly — see deploy/zitadel/README.md. Everything BELOW this line is Zitadel's
# internal config: the project, the per-app OIDC clients that products federate
# through, the SES sending config, and instance branding.
#
# AUTH BOOTSTRAP (one-time, cannot be Terraformed — it is the chicken-and-egg):
# a `terraform` machine user with the IAM_OWNER role and a JSON key was created
# through the console/API; the key lives at infra/zitadel-provider-key.json and
# is GITIGNORED. To re-bootstrap on a fresh instance, create a machine user,
# grant IAM_OWNER, generate a JSON key, and drop it at that path.
provider "zitadel" {
  domain           = "id.fleetworks.dev"
  jwt_profile_file = "${path.module}/zitadel-provider-key.json"
}

# ── Project + per-app OIDC clients ───────────────────────────────────────────
# One Zitadel project holds every Fleetworks product app. Each product's Supabase
# project becomes a separate OIDC application (relying party) inside it, so a
# leaked client secret is scoped to a single product.
resource "zitadel_project" "fleetworks_suite" {
  name   = "Fleetworks Suite"
  org_id = var.zitadel_org_id

  # Assert project roles into tokens later (sub-project 4, central RBAC). Off
  # for the pilot: the products authorize off their own Supabase rows today.
  project_role_assertion = false
  project_role_check     = false
  has_project_check      = false

  # Show the instance-level (Fleetworks) branding on the login screen for every
  # app in this project, rather than per-app branding.
  private_labeling_setting = "PRIVATE_LABELING_SETTING_ENFORCE_PROJECT_RESOURCE_OWNER_POLICY"
}

# yellow-pages: the pilot relying party. The redirect URI is Supabase's fixed
# Custom-OIDC callback for the yp project — Supabase completes the code exchange,
# then hands its OWN session back to the yp web/mobile surfaces.
resource "zitadel_application_oidc" "yellow_pages" {
  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = "Yellow Pages (Supabase)"

  redirect_uris = ["https://${var.yellow_pages_supabase_ref}.supabase.co/auth/v1/callback"]
  post_logout_redirect_uris = [
    "https://yp.fleetworks.dev/",
  ]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_WEB"

  # Confidential client: Supabase stores the client secret server-side, so
  # client_secret_basic is correct here (PKCE-only would be for public clients).
  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_BASIC"
  access_token_type = "OIDC_TOKEN_TYPE_BEARER"

  # Supabase reads `email` + `email_verified` to decide identity linking, and it
  # reads them from the ID token — assert userinfo claims into it.
  id_token_userinfo_assertion = true

  # dev_mode relaxes redirect-URI validation; must stay false in production.
  dev_mode = false
}


# The remaining product apps. Each Supabase project is its own relying party so
# a leaked client secret is scoped to one product; all of them sit in the same
# Zitadel project so instance branding and (later) project roles apply
# uniformly. Adding an app is this resource plus a syncCustomOidcProvider run.
locals {
  fleetworks_apps = {
    helmsman = { name = "Helmsman (Supabase)", ref = var.helmsman_supabase_ref, site = "https://helmsman.fleetworks.dev" }
    rolodex  = { name = "Rolodex (Supabase)", ref = var.rolodex_supabase_ref, site = "https://rolodex.fleetworks.dev" }
    warden   = { name = "Warden (Supabase)", ref = var.warden_supabase_ref, site = "https://warden.fleetworks.dev" }
    chorus   = { name = "Chorus (Supabase)", ref = var.chorus_supabase_ref, site = "https://chorus.fleetworks.dev" }
  }
}

resource "zitadel_application_oidc" "app" {
  for_each = local.fleetworks_apps

  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = each.value.name

  redirect_uris             = ["https://${each.value.ref}.supabase.co/auth/v1/callback"]
  post_logout_redirect_uris = ["${each.value.site}/"]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_WEB"

  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_BASIC"
  access_token_type = "OIDC_TOKEN_TYPE_BEARER"

  # Supabase reads email + email_verified from the ID token to decide linking.
  id_token_userinfo_assertion = true
  dev_mode                    = false
}

output "app_oidc_client_ids" {
  description = "Per-app OIDC client_id, keyed by app slug — consumed by each project's Supabase custom provider."
  value       = { for k, v in zitadel_application_oidc.app : k => v.client_id }
  sensitive   = true
}

output "app_oidc_client_secrets" {
  description = "Per-app OIDC client_secret, keyed by app slug."
  value       = { for k, v in zitadel_application_oidc.app : k => v.client_secret }
  sensitive   = true
}

# ── Rolodex direct-Zitadel cutover (Phase 1) — public PKCE clients ──────────
# Distinct from zitadel_application_oidc.app["rolodex"] above (the legacy
# Supabase-relying-party client, kept as-is — it's the runbook's rollback
# fixture, see zitadel-phase1-prod-client-registration.md). These two are
# rolodex's own direct Auth Code + PKCE clients: rolodex_web is a server-side
# backend-for-frontend (apps/web/src/app/auth/callback/route.ts runs the code
# exchange in Node, not browser JS — WEB, not USER_AGENT), rolodex_mobile is a
# genuine native app. Both public (no client secret), JWT access tokens
# (packages/auth's jose-based jwtVerify requires a real JWT, not an opaque
# token — matches the local zitadel-local/seed.ts fix).
resource "zitadel_application_oidc" "rolodex_web" {
  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = "Rolodex Web (Zitadel direct)"

  redirect_uris             = ["https://rolodex.fleetworks.dev/auth/callback"]
  post_logout_redirect_uris = ["https://rolodex.fleetworks.dev/"]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_WEB"

  # Public client despite being server-side (auth_method NONE, no secret) —
  # a deliberate choice, not a forced one; see the plan doc's Open Questions.
  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_NONE"
  access_token_type = "OIDC_TOKEN_TYPE_JWT"

  # Must stay false in production (relaxes redirect-URI validation) —
  # matches the other apps above, not local's developmentMode: true.
  dev_mode = false
}

resource "zitadel_application_oidc" "rolodex_mobile" {
  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = "Rolodex Mobile"

  redirect_uris             = ["rolodex://auth/callback"]
  post_logout_redirect_uris = ["rolodex://"]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_NATIVE"

  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_NONE"
  access_token_type = "OIDC_TOKEN_TYPE_JWT"
  dev_mode          = false
}

output "rolodex_web_client_id" {
  description = "rolodex_web's client_id (public client — no client_secret exists to output)."
  value       = zitadel_application_oidc.rolodex_web.client_id
  sensitive   = true
}

output "rolodex_mobile_client_id" {
  description = "rolodex_mobile's client_id (public client — no client_secret exists to output)."
  value       = zitadel_application_oidc.rolodex_mobile.client_id
  sensitive   = true
}

# ── Yellow Pages direct-Zitadel cutover (Phase 4) — public PKCE client ───────
# Distinct from zitadel_application_oidc.yellow_pages above (the legacy
# Supabase-relying-party client, kept untouched as the rollback fixture — see
# yellow-pages/.omc/plans/phase4-yellow-pages-zitadel-cutover.md, Scope item 1).
#
# WEB, not USER_AGENT: the code exchange runs server-side in Node. Confirmed by
# reading yellow-pages/apps/web/src/app/auth/callback/route.ts:16 — the callback
# is a Next.js App Router route handler (`export async function GET(request:
# NextRequest)`) with no `runtime = 'edge'` and no client component; the
# post-cutover rewrite keeps the exchange in that same handler, mirroring
# rolodex_web's already-verified shape. The browser never holds the
# code_verifier or calls the token endpoint.
#
# Public client (auth_method NONE, no secret) + JWT access tokens, matching
# rolodex_web exactly: @cogs/auth's jose-based jwtVerify requires a real JWT,
# not an opaque token.
resource "zitadel_application_oidc" "yellow_pages_web" {
  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = "Yellow Pages Web (Zitadel direct)"

  redirect_uris             = ["https://yp.fleetworks.dev/auth/callback"]
  post_logout_redirect_uris = ["https://yp.fleetworks.dev/"]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_WEB"

  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_NONE"
  access_token_type = "OIDC_TOKEN_TYPE_JWT"

  # Unlike rolodex_web (whose web tier never reads name/email off the token),
  # yellow-pages' apps/web/src/app/api/session/route.ts reads `email`/`name`
  # from the ID TOKEN's claims (openid-client's tokens.claims()) to populate
  # the topbar and admin self-demotion guard. Without this, Zitadel only
  # asserts the bare required claims (sub/aud/iss/exp) into the ID token even
  # though `profile email` is requested in the scope — email/name land on the
  # userinfo endpoint instead, which this app never calls. Discovered via a
  # real production smoke test: topbar showed "Sign in" for a genuinely
  # authenticated break-glass admin. Per-app only — no shared-project impact.
  id_token_userinfo_assertion = true

  # Must stay false in production (relaxes redirect-URI validation).
  dev_mode = false
}

output "yellow_pages_web_client_id" {
  description = "yellow_pages_web's client_id (public client — no client_secret exists to output)."
  value       = zitadel_application_oidc.yellow_pages_web.client_id
  sensitive   = true
}

# ── Chorus direct-Zitadel cutover (Phase 4) — public PKCE client ─────────────
# Distinct from zitadel_application_oidc.app["chorus"] above (the legacy
# Supabase-relying-party client inside the local.fleetworks_apps for_each, kept
# untouched as the rollback fixture — see
# chorus/.omc/plans/phase4-chorus-zitadel-cutover.md, Scope item 1 and
# Principle 5).
#
# WEB, not USER_AGENT: the code exchange runs server-side in Node. Confirmed by
# reading chorus/apps/web/src/app/auth/callback/route.ts:16,36-37 — the callback
# is a Next.js App Router route handler (`export async function GET(request:
# NextRequest)`) with no `runtime = 'edge'` and no client component, and it does
# the exchange server-side today (`createSupabaseServerClient()` +
# `exchangeCodeForSession(code)`). That route is rewritten by the plan's Scope
# item 7, but Decision 3 ports rolodex's/yellow-pages' proven BFF session
# subsystem — the exchange stays in this same Node handler and the browser never
# holds the code_verifier or calls the token endpoint. Same shape as
# rolodex_web and yellow_pages_web.
#
# Redirect URI matches the real production web domain — cross-checked against
# local.fleetworks_apps.chorus.site above, which already yields
# post_logout_redirect_uris = ["https://chorus.fleetworks.dev/"].
#
# Public client (auth_method NONE, no secret) + JWT access tokens, matching
# rolodex_web and yellow_pages_web exactly: @cogs/auth's jose-based jwtVerify
# requires a real JWT, not an opaque token.
resource "zitadel_application_oidc" "chorus_web" {
  org_id     = var.zitadel_org_id
  project_id = zitadel_project.fleetworks_suite.id
  name       = "Chorus Web (Zitadel direct)"

  redirect_uris             = ["https://chorus.fleetworks.dev/auth/callback"]
  post_logout_redirect_uris = ["https://chorus.fleetworks.dev/"]

  response_types = ["OIDC_RESPONSE_TYPE_CODE"]
  grant_types    = ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"]
  app_type       = "OIDC_APP_TYPE_WEB"

  auth_method_type  = "OIDC_AUTH_METHOD_TYPE_NONE"
  access_token_type = "OIDC_TOKEN_TYPE_JWT"

  # Set for the same reason yellow_pages_web sets it (see that block's note):
  # chorus's plan Decision 3 ports yellow-pages' session subsystem verbatim,
  # including the `/api/session` route that reads `email`/`name` off the ID
  # TOKEN's claims. Without this, Zitadel asserts only sub/aud/iss/exp into the
  # ID token even with `profile email` in scope, and those claims land on the
  # userinfo endpoint the ported code never calls — the exact defect a real
  # yellow-pages production smoke test caught (topbar showed "Sign in" for a
  # genuinely authenticated admin). Per-app only, no shared-project impact.
  id_token_userinfo_assertion = true

  # Must stay false in production (relaxes redirect-URI validation).
  dev_mode = false
}

output "chorus_web_client_id" {
  description = "chorus_web's client_id (public client — no client_secret exists to output)."
  value       = zitadel_application_oidc.chorus_web.client_id
  sensitive   = true
}

# ── Yellow Pages admin-directory credential (Phase 4, Decision 0) ────────────
# Backs apps/api/src/routes/admin-users.ts's listUsers(), which reads Supabase's
# auth.users today and stops being populated once accounts are Zitadel-native.
#
# READ-ONLY BY CONSTRUCTION. ORG_OWNER_VIEWER, deliberately NOT
# ORG_USER_MANAGER: verified against Zitadel's own cmd/defaults.yaml
# role-permission mapping, ORG_OWNER_VIEWER grants user.read + user.global.read
# (plus read-only org/idp/action/flow/project/policy) with ZERO write or delete
# permissions. ORG_USER_MANAGER would additionally grant user.write,
# user.delete, user.grant.write/delete and session.delete — none of which this
# read path needs, and unnecessary privilege on a production credential.
#
# BLAST RADIUS, stated honestly: all 5 Fleetworks apps share one Zitadel org
# (var.zitadel_org_id), so this credential can list EVERY Fleetworks user across
# all 5 apps, not just yellow-pages'. That is wider than the Supabase
# service-role key it replaces (scoped to yellow-pages' own project). Accepted
# because Zitadel's permission model offers no narrower role, and the credential
# is genuinely read-only.
#
# Real expiry with a named owner — deliberately NOT inheriting the
# lhci_seed_bot / lhci_login_client PATs' 9999-12-31 no-owner gap above, which
# those blocks themselves call a known unresolved open item. Owner: Andrew Cates
# (catesandrew@gmail.com). Rotate before 2027-08-26.
resource "zitadel_machine_user" "yellow_pages_admin_directory" {
  org_id            = var.zitadel_org_id
  user_name         = "yellow-pages-admin-directory"
  name              = "Yellow Pages Admin Directory (read-only)"
  description       = "Read-only user directory access for yellow-pages' /admin/users screen"
  access_token_type = "ACCESS_TOKEN_TYPE_JWT"
}

resource "zitadel_org_member" "yellow_pages_admin_directory" {
  org_id  = var.zitadel_org_id
  user_id = zitadel_machine_user.yellow_pages_admin_directory.id
  roles   = ["ORG_OWNER_VIEWER"]
}

resource "zitadel_personal_access_token" "yellow_pages_admin_directory" {
  org_id          = var.zitadel_org_id
  user_id         = zitadel_machine_user.yellow_pages_admin_directory.id
  expiration_date = "2027-08-26T23:59:59Z"
}

output "yellow_pages_admin_directory_pat" {
  description = "Read-only Zitadel Management API PAT for yellow-pages' /admin/users directory (Phase 4 Decision 0)."
  value       = zitadel_personal_access_token.yellow_pages_admin_directory.token
  sensitive   = true
}

# ── Transactional email via the hub's own SES identity ───────────────────────
# Credentials come straight from this root's IAM resources (iam.tf) — no manual
# copy/paste of an SMTP password, and rotation is `terraform apply`.
resource "zitadel_email_provider_smtp" "ses" {
  description = "AWS SES (${var.ses_region}) — auth.id.fleetworks.dev"
  # DELIBERATELY :587 (STARTTLS), not :465. Zitadel logs
  #   "could not connect using normal tls. trying starttls instead..."
  # on every send here — one wasted round-trip, then it succeeds. Moving to :465
  # to silence that was tried and REVERTED: updating a live SMTP config trips a
  # Zitadel bug where the projection emits invalid SQL —
  #   projections.smtp_configs6: multiple assignments to same column "password"
  #   (SQLSTATE 42601)
  # which wedges the projection. Mail kept flowing on the last good projected
  # row (:587), so the new port never took effect and the only result was a
  # stuck projection. Not worth it for a cosmetic log line; revisit when
  # upstream fixes the double-assignment.
  host             = "email-smtp.${var.ses_region}.amazonaws.com:587"
  user             = aws_iam_access_key.ses[var.hub_identity_domain].id
  password         = aws_iam_access_key.ses[var.hub_identity_domain].ses_smtp_password_v4
  sender_address   = "no-reply@${var.hub_identity_domain}"
  sender_name      = "Fleetworks"
  reply_to_address = "support@fleetworks.dev"
  tls              = true
  set_active       = true

  depends_on = [aws_sesv2_email_identity_mail_from_attributes.this]
}

# ── Instance branding ────────────────────────────────────────────────────────
# Fleetworks gold on the hosted login + console, plus the wordmark.
#
# The brand mark is a WORDMARK, not a glyph: packages/ui/src/Logo.tsx renders
# the text "Fleetworks" at weight 600 / -0.01em in --fw-font-sans. There is no
# icon design anywhere in the fleet, so `icon_path` is deliberately left unset
# rather than inventing one — Zitadel falls back to the logo.
#
# infra/brand/*.png are generated by scripts/render-brand-logo.mjs from those
# same tokens (ink #0b0f14 on light, paper #ffffff on dark) at 3x, so the mark
# stays in step with the design system instead of being a hand-exported file.
resource "zitadel_default_label_policy" "fleetworks" {
  primary_color    = "#a26000"
  background_color = "#fafafa"
  font_color       = "#000000"
  warn_color       = "#cd3d56"

  primary_color_dark    = "#d99b2b"
  background_color_dark = "#111827"
  font_color_dark       = "#ffffff"
  warn_color_dark       = "#ff3b5b"

  theme_mode             = "THEME_MODE_AUTO"
  hide_login_name_suffix = true
  disable_watermark      = true
  set_active             = true

  logo_path      = "${path.module}/brand/logo-light.png"
  logo_dark_path = "${path.module}/brand/logo-dark.png"
}

# ── Login behaviour ──────────────────────────────────────────────────────────
# Every value here restates the instance's existing defaults EXCEPT
# default_redirect_uri. Without it, a user who reaches the hub directly (rather
# than through an app's "Sign in with Fleetworks") finishes login on a dead-end
# "You are signed in." page with nowhere to go. This sends them to the apex,
# which lists the products. The real fix is the account portal (sub-project 6).
resource "zitadel_default_login_policy" "fleetworks" {
  default_redirect_uri = "https://fleetworks.dev"

  user_login               = true
  allow_register           = true
  allow_external_idp       = true
  allow_domain_discovery   = true
  force_mfa                = false
  force_mfa_local_only     = false
  hide_password_reset      = false
  ignore_unknown_usernames = false
  passwordless_type        = "PASSWORDLESS_TYPE_ALLOWED"

  second_factors = ["SECOND_FACTOR_TYPE_OTP", "SECOND_FACTOR_TYPE_U2F"]
  multi_factors  = ["MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION"]

  password_check_lifetime       = "864000s"
  external_login_check_lifetime = "864000s"
  mfa_init_skip_lifetime        = "2592000s"
  second_factor_check_lifetime  = "64800s"
  multi_factor_check_lifetime   = "43200s"
}

# ── Transactional message copy ───────────────────────────────────────────────
# Zitadel's stock text is Zitadel-branded ("Zitadel - Verify email") and its
# English set omits VerifyEmail.Footer, which logs a `missing translation`
# warning on every send. These were first set by hand through the admin API;
# they live here so a rebuilt instance keeps the branding.
resource "zitadel_default_verify_email_message_text" "en" {
  language    = "en"
  title       = "Fleetworks — verify your email"
  pre_header  = "Verify your email address"
  subject     = "Verify your Fleetworks email address"
  greeting    = "Hello {{.DisplayName}},"
  text        = "Welcome to Fleetworks. Use the button below to verify your email address, or enter this code: {{.Code}}. If you did not create a Fleetworks account, you can safely ignore this message."
  button_text = "Verify email"
  footer_text = "Sent by Fleetworks · fleetworks.dev"
}

resource "zitadel_default_password_reset_message_text" "en" {
  language    = "en"
  title       = "Fleetworks — reset your password"
  pre_header  = "Reset your password"
  subject     = "Reset your Fleetworks password"
  greeting    = "Hello {{.DisplayName}},"
  text        = "We received a request to reset your Fleetworks password. Use the button below, or enter this code: {{.Code}}. If you did not request this, you can safely ignore this message and your password will stay unchanged."
  button_text = "Reset password"
  footer_text = "Sent by Fleetworks · fleetworks.dev"
}

resource "zitadel_default_init_message_text" "en" {
  language    = "en"
  title       = "Fleetworks — activate your account"
  pre_header  = "Activate your account"
  subject     = "Activate your Fleetworks account"
  greeting    = "Hello {{.DisplayName}},"
  text        = "A Fleetworks account was created for you. Use the button below to set your password and activate it, or enter this code: {{.Code}}."
  button_text = "Activate account"
  footer_text = "Sent by Fleetworks · fleetworks.dev"
}

resource "zitadel_default_invite_user_message_text" "en" {
  language    = "en"
  title       = "Fleetworks — you have been invited"
  pre_header  = "You have been invited to Fleetworks"
  subject     = "You have been invited to Fleetworks"
  greeting    = "Hello {{.DisplayName}},"
  text        = "You have been invited to Fleetworks. Use the button below to accept the invitation and set your password, or enter this code: {{.Code}}."
  button_text = "Accept invitation"
  footer_text = "Sent by Fleetworks · fleetworks.dev"
}

# ── Outputs consumed by the Supabase Custom OIDC provider (Task 5) ───────────
output "zitadel_issuer" {
  description = "OIDC issuer for the Fleetworks hub — the value Supabase's custom provider is pointed at."
  value       = "https://id.fleetworks.dev"
}

output "yellow_pages_oidc_client_id" {
  description = "OIDC client_id for the yellow-pages Supabase relying party."
  value       = zitadel_application_oidc.yellow_pages.client_id
  sensitive   = true
}

output "yellow_pages_oidc_client_secret" {
  description = "OIDC client_secret for the yellow-pages Supabase relying party."
  value       = zitadel_application_oidc.yellow_pages.client_secret
  sensitive   = true
}

# ── Phase 1 test/service identities — zitadel-phase1-prod-client-registration.md ──
# Passwords are read from gitignored local files (never embedded in this
# committed .tf), matching the jwt_profile_file pattern already used for the
# provider's own key above. Known tradeoff (same one that pattern already
# has, now widened): this file() call means even `terraform plan` — a
# read-only operation — hard-fails on any machine/CI runner that doesn't
# have this gitignored file. Anyone re-running this root elsewhere needs
# the password delivered out-of-band first.
locals {
  lhci_test_password         = trimspace(file("${path.module}/lhci-zitadel-test-password.txt"))
  appreview_password         = trimspace(file("${path.module}/appreview-password.txt"))
  yellowpages_admin_password = trimspace(file("${path.module}/yellowpages-admin-password.txt"))
}

# App Store review demo account — one of the 2 real production rolodex
# accounts identified for Phase 2's zitadel_subject backfill (the other,
# catesandrew@gmail.com, already exists as a Zitadel user org-wide).
# Password matches rolodex/apps/mobile's existing REVIEW_DEMO_PASSWORD
# exactly, so App Store reviewers' current credentials keep working
# post-cutover — not a fresh credential to distribute.
resource "zitadel_human_user" "appreview" {
  org_id                       = var.zitadel_org_id
  user_name                    = "appreview@rolodex.fleetworks.dev"
  first_name                   = "App"
  last_name                    = "Review"
  email                        = "appreview@rolodex.fleetworks.dev"
  is_email_verified            = true
  initial_password             = local.appreview_password
  initial_skip_password_change = true
}

# yellow-pages Phase 4 break-glass admin account. Provisioned fresh — no
# prior Zitadel account existed for this email (unlike catesandrew@gmail.com,
# which already existed org-wide). Preserves today's production break-glass
# admin set of 2 (see admin-users backfill in the Phase 4 plan's Decision 2)
# rather than silently dropping to 1 admin at cutover.
resource "zitadel_human_user" "yellowpages_admin" {
  org_id                       = var.zitadel_org_id
  user_name                    = "admin@yellowpages.dev"
  first_name                   = "Yellow Pages"
  last_name                    = "Admin"
  email                        = "admin@yellowpages.dev"
  is_email_verified            = true
  initial_password             = local.yellowpages_admin_password
  initial_skip_password_change = true
}

# The phase1-verify account (standalone rolodex_web/rolodex_mobile protocol
# verification, Step 7) existed here and was deleted after verification
# succeeded (2026-08-25) — its only purpose was Step 7, which is done. See
# rolodex-supabase-client-backup.json's sibling note and the plan doc's
# Phase 1 execution record for what it verified before removal.

# Lighthouse CI's dedicated login account — authenticates through
# rolodex_web's client_id (AUTH_AUDIENCE), same invariant as
# apps/api/src/routes/testing.ts:220-227. Never the general seed/test-admin
# credentials.
resource "zitadel_human_user" "lhci_test" {
  org_id                       = var.zitadel_org_id
  user_name                    = "lhci-zitadel-test@fleetworks.dev"
  first_name                   = "Lighthouse"
  last_name                    = "CI"
  email                        = "lhci-zitadel-test@fleetworks.dev"
  is_email_verified            = true
  initial_password             = local.lhci_test_password
  initial_skip_password_change = true
}

# Machine caller for testing.ts's CreateSession call (authenticates the
# CALLER, not the account being logged in — testing.ts:66-69). No special
# instance role: Session API's CreateSession only needs a valid authenticated
# principal in the org, not IAM_OWNER or IAM_LOGIN_CLIENT.
resource "zitadel_machine_user" "lhci_seed_bot" {
  org_id      = var.zitadel_org_id
  user_name   = "lhci-seed-bot@fleetworks.dev"
  name        = "Lighthouse CI seed-bot (Session API caller)"
  description = "testing.ts's ZITADEL_SEED_BOT_PAT — authenticates CreateSession calls only."
}

resource "zitadel_personal_access_token" "lhci_seed_bot" {
  org_id  = var.zitadel_org_id
  user_id = zitadel_machine_user.lhci_seed_bot.id
  # Zitadel's own server-side default when this attribute is left unset —
  # pinned explicitly (confirmed via `terraform plan` post-apply) so this
  # config matches reality instead of drifting toward null every plan.
  # Rotation policy for this PAT is a known open item, not automated yet.
  expiration_date = "9999-12-31T23:59:59Z"
}

# Dedicated login-client machine user — resolves pre-mortem #2: a SEPARATE
# IAM_LOGIN_CLIENT-scoped identity from the shared one that powers the
# hosted Login V2 UI for every Fleetworks app (infra/zitadel-login-client.pat).
# IAM_LOGIN_CLIENT is itself instance-wide — this does NOT narrow the
# capability grant — but it buys independent revocability: this PAT can be
# rotated/revoked without touching the shared identity every app's hosted
# login depends on, and a compromise here doesn't leak the shared secret.
resource "zitadel_machine_user" "lhci_login_client" {
  org_id      = var.zitadel_org_id
  user_name   = "lhci-login-client@fleetworks.dev"
  name        = "Lighthouse CI login-client (CreateCallback caller)"
  description = "testing.ts's ZITADEL_LOGIN_CLIENT_PAT — dedicated IAM_LOGIN_CLIENT, distinct from the shared login-client identity."
}

resource "zitadel_instance_member" "lhci_login_client" {
  user_id = zitadel_machine_user.lhci_login_client.id
  roles   = ["IAM_LOGIN_CLIENT"]
}

# expiration_date pinned far-future, matching lhci_seed_bot's PAT above —
# rotation for both is a known open item (Phase 2 prerequisite, no owner
# assigned yet); the token value is recoverable from Terraform state
# (S3+KMS) if the local gitignored copy is ever lost.
resource "zitadel_personal_access_token" "lhci_login_client" {
  org_id          = var.zitadel_org_id
  user_id         = zitadel_machine_user.lhci_login_client.id
  expiration_date = "9999-12-31T23:59:59Z"
}

output "lhci_seed_bot_pat" {
  description = "ZITADEL_SEED_BOT_PAT for apps/api's testing.ts — Phase 2 Render secret."
  value       = zitadel_personal_access_token.lhci_seed_bot.token
  sensitive   = true
}

output "lhci_login_client_pat" {
  description = "ZITADEL_LOGIN_CLIENT_PAT for apps/api's testing.ts — Phase 2 Render secret."
  value       = zitadel_personal_access_token.lhci_login_client.token
  sensitive   = true
}
