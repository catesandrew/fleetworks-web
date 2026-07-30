# Outputs feed the Zitadel SMTP configuration (Task 3) and DNS verification.
# Secret values (SMTP password, IAM access key id) are marked sensitive; read
# them with `terraform output -raw`, NEVER commit them to any repo.

output "aws_account_id" {
  description = "AWS account id backing the SES identity."
  value       = data.aws_caller_identity.current.account_id
}

output "smtp_hosts" {
  description = "SES SMTP endpoint host, keyed by identity domain."
  value       = { for k, _ in var.domains : k => "email-smtp.${var.ses_region}.amazonaws.com" }
}

output "smtp_usernames" {
  description = "SES SMTP username (IAM access key id), keyed by identity domain."
  value       = { for k, _ in var.domains : k => aws_iam_access_key.ses[k].id }
  sensitive   = true
}

output "smtp_passwords" {
  description = "SES SMTP password (SigV4-derived from the secret access key), keyed by identity domain."
  value       = { for k, _ in var.domains : k => aws_iam_access_key.ses[k].ses_smtp_password_v4 }
  sensitive   = true
}

output "dkim_tokens" {
  description = "SES Easy-DKIM tokens (3), keyed by identity domain — for verifying the published CNAMEs."
  value       = { for k, _ in var.domains : k => tolist(aws_sesv2_email_identity.this[k].dkim_signing_attributes[0].tokens) }
}

output "mail_from_domains" {
  description = "Custom MAIL FROM (Return-Path) domain, keyed by identity domain."
  value       = { for k, _ in var.domains : k => "bounce.${k}" }
}

output "hub_hostnames" {
  description = "Browser-facing hub hostnames created in the fleetworks.dev zone, mapped to their Render targets."
  value       = { for k, v in var.hub_records : "${k}.fleetworks.dev" => v }
}
