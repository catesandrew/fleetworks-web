# AWS SES v2 — the auth-hub's own email identity (`auth.id.fleetworks.dev`).
# Zitadel sends its transactional mail (verification, invite, password reset)
# through this identity's SMTP credential, so the hub's deliverability is
# isolated from every product app's identity.
resource "aws_sesv2_email_identity" "this" {
  for_each = var.domains

  email_identity = each.key

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# Custom MAIL FROM (envelope/Return-Path) domain `bounce.<domain>`.
# REJECT_MESSAGE fails closed if the MAIL FROM MX/SPF records are missing, rather
# than silently falling back to amazonses.com (which weakens SPF alignment).
resource "aws_sesv2_email_identity_mail_from_attributes" "this" {
  for_each = var.domains

  email_identity         = aws_sesv2_email_identity.this[each.key].email_identity
  mail_from_domain       = "bounce.${each.key}"
  behavior_on_mx_failure = "REJECT_MESSAGE"
}
