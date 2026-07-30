# Terraform + provider version constraints.
#
# Pinned to Cloudflare provider v4.x on purpose (v5 has breaking resource-schema
# changes). Records use the `content` attribute (v4.40+; `value` is deprecated).
terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.52"
    }
  }
}
