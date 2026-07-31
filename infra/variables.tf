variable "ses_region" {
  description = "AWS region for SES (SMTP endpoint + SigV4 SMTP password derivation + per-region production access). All fleetworks identities share us-east-2 so the single granted production-access request covers them."
  type        = string
  default     = "us-east-2"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account id that owns the fleetworks.dev zone. Not a secret; sourced from ~/.envrc (CLOUDFLARE_ACCOUNT_ID)."
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (scoped to DNS edit). Sourced from the environment, never hardcoded: export TF_VAR_cloudflare_api_token=\"$CLOUDFLARE_API_TOKEN\"."
  type        = string
  sensitive   = true
}

variable "hub_identity_domain" {
  description = "The hub's SES From/identity domain — the key into var.domains that Zitadel sends transactional mail as."
  type        = string
  default     = "auth.id.fleetworks.dev"

  validation {
    condition     = startswith(var.hub_identity_domain, "auth.")
    error_message = "hub_identity_domain must be an auth.<host>.fleetworks.dev identity domain."
  }
}

variable "zitadel_org_id" {
  description = "Zitadel organization id that owns the Fleetworks project and its OIDC apps. Not a secret; read from GET /admin/v1/orgs/default on the live instance."
  type        = string
}

variable "yellow_pages_supabase_ref" {
  description = "Supabase project ref for yellow-pages — forms the fixed OIDC callback https://<ref>.supabase.co/auth/v1/callback that Zitadel must allow."
  type        = string
}

variable "helmsman_supabase_ref" {
  description = "Supabase project ref for helmsman."
  type        = string
}

variable "rolodex_supabase_ref" {
  description = "Supabase project ref for rolodex."
  type        = string
}

variable "warden_supabase_ref" {
  description = "Supabase project ref for warden."
  type        = string
}

variable "chorus_supabase_ref" {
  description = "Supabase project ref for chorus."
  type        = string
}

variable "domains" {
  description = <<-EOT
    SES/DNS domain map for the auth hub, keyed by the From/identity domain
    `auth.id.fleetworks.dev`. One SES identity and one IAM SMTP user are
    provisioned per entry. This root owns ONLY the hub — each product app keeps
    its own per-repo infra root and its own `auth.<sub>.fleetworks.dev` identity.

    Attributes:
      - cloudflare_zone_id : the Cloudflare zone the DNS records are written to
                             (the fleetworks.dev zone).
      - site_slug          : short slug; names IAM users and policies.
      - dmarc_rua          : DMARC aggregate-report mailbox. Provision this inbox
                             before tightening p=quarantine -> p=reject.
  EOT
  type = map(object({
    cloudflare_zone_id = string
    site_slug          = string
    dmarc_rua          = optional(string, "dmarc@fleetworks.dev")
  }))
  default = {}

  validation {
    condition     = alltrue([for k, _ in var.domains : startswith(k, "auth.")])
    error_message = "Each domains key must be a From/identity domain of the form auth.<host>.fleetworks.dev."
  }
}
