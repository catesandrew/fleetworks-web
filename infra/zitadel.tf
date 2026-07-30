# Zitadel's own configuration plane as IaC.
#
# The server itself (container image, Postgres, custom domain) is provisioned on
# Render — see deploy/zitadel/README.md. Everything BELOW this line is Zitadel's
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

# ── Transactional email via the hub's own SES identity ───────────────────────
# Credentials come straight from this root's IAM resources (iam.tf) — no manual
# copy/paste of an SMTP password, and rotation is `terraform apply`.
resource "zitadel_email_provider_smtp" "ses" {
  description      = "AWS SES (${var.ses_region}) — auth.id.fleetworks.dev"
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
# Fleetworks gold on the hosted login + console. The logo/icon assets are NOT
# managed here yet (the provider uploads them from a local file path and the
# Boxes mark has no exported raster in this repo) — see the runbook follow-up.
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
