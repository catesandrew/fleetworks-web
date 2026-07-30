# SMTP credential for the auth hub. One IAM user + access key for the hub's SES
# identity, so a compromised hub SMTP credential cannot send as any product
# brand. The SMTP password is derived from the secret access key (SigV4) via the
# provider's `ses_smtp_password_v4` attribute — see outputs.tf.
resource "aws_iam_user" "ses" {
  for_each = var.domains

  name = "ses-smtp-${each.value.site_slug}"
  path = "/cogs/ses/"

  tags = {
    Project     = "fleetworks-hub"
    Brand       = each.value.site_slug
    SESIdentity = each.key
  }
}

resource "aws_iam_access_key" "ses" {
  for_each = var.domains

  user = aws_iam_user.ses[each.key].name
}

# Inline send policy: allow ONLY ses:SendRawEmail (the action the SMTP interface
# uses), SCOPED BY ENVELOPE FROM ADDRESS to this identity's domain via the
# `ses:FromAddress` condition. A compromised SMTP credential can therefore only
# send AS the hub (*@auth.id.fleetworks.dev).
#
# WHY NOT resource-scope to the identity ARN: SES also authorizes SendRawEmail
# against the *recipient* identity (verified recipients are identities, esp. in
# sandbox), so `Resource = <sender identity ARN>` denies sends to any recipient
# not listed — it blocked all sending (554 "not authorized ... on resource
# identity/<recipient>"). The FromAddress condition avoids that and works in both
# sandbox and production.
#
# NEVER use "ses:FromDomain" — it is NOT a valid SES condition key; a StringLike
# on it matches nothing and every send is denied.
resource "aws_iam_user_policy" "ses_send" {
  for_each = var.domains

  name = "ses-send-${each.value.site_slug}"
  user = aws_iam_user.ses[each.key].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSendRawEmailAsThisBrand"
        Effect    = "Allow"
        Action    = ["ses:SendRawEmail"]
        Resource  = "*"
        Condition = { StringLike = { "ses:FromAddress" = "*@${each.key}" } }
      }
    ]
  })
}
