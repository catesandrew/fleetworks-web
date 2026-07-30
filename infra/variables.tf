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
