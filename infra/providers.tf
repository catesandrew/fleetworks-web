# Provider configuration.
#
# AWS credentials are NOT declared here and MUST NOT be committed. Supply them
# out-of-band (env: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_PROFILE, or
# an assumed CI OIDC role). See README.md — "AWS credentials prerequisite".
provider "aws" {
  region = var.ses_region
}

# Cloudflare API token is sourced from the environment, never hardcoded:
#   export TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
# (CLOUDFLARE_API_TOKEN lives in ~/.envrc — never commit that file.)
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Used only to document/derive the AWS account id for SES identity ARNs and the
# SES production-access request. The IAM send policy references the SES identity
# resource ARN directly (see iam.tf), so this is not required for scoping.
data "aws_caller_identity" "current" {}
