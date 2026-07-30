# Terraform + provider version constraints.
#
# Pinned to Cloudflare provider v4.x on purpose (v5 has breaking resource-schema
# changes). Records use the `content` attribute (v4.40+; `value` is deprecated).
terraform {
  # >= 1.11 (NOT the 1.5.x the other fleetworks infra roots pin): the zitadel
  # provider marks `zitadel_email_provider_smtp.password` WRITE-ONLY, and only
  # 1.11+ understands write-only attributes — 1.5.7 hard-errors on any non-null
  # value. Homebrew's `terraform` formula is frozen at 1.5.7 (BUSL relicense),
  # so this root is applied with ~/.local/bin/terraform-1.15.8. Its state key is
  # separate (fleetworks/hub), so nothing else is pulled forward.
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
    # Zitadel's own config plane (org/project/OIDC app/SMTP) as IaC. Pinned to
    # 3.x — the provider authenticates as the `terraform` machine user via the
    # gitignored JWT profile key (see zitadel.tf).
    zitadel = {
      source  = "zitadel/zitadel"
      version = "~> 3.3"
    }
  }
}
