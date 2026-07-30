# Cloudflare DNS for the SES identity/email plane.
#
# Every record here is proxied = false: DKIM/SPF/MAIL FROM/DMARC are mail-auth
# records that carry no browser traffic, and Cloudflare's orange-cloud proxy
# would break DKIM CNAME resolution. The hub's browser-facing hosts
# (id./account.) live in hub-dns.tf and are also unproxied, because Render
# terminates TLS with its own cert.

# --- DKIM: 3 CNAMEs per domain -------------------------------------------------
# SES Easy DKIM emits exactly 3 tokens per identity. The token VALUES are only
# known after apply, so the for_each map is keyed by a STATIC "<domain>#<index>"
# (0..2) — keys never depend on computed values, only the record contents do.
locals {
  dkim_records = merge([
    for domain, cfg in var.domains : {
      for idx in range(3) :
      "${domain}#${idx}" => {
        domain  = domain
        zone_id = cfg.cloudflare_zone_id
        token   = tolist(aws_sesv2_email_identity.this[domain].dkim_signing_attributes[0].tokens)[idx]
      }
    }
  ]...)
}

resource "cloudflare_record" "dkim" {
  for_each = local.dkim_records

  zone_id = each.value.zone_id
  name    = "${each.value.token}._domainkey.${each.value.domain}"
  type    = "CNAME"
  content = "${each.value.token}.dkim.amazonses.com"
  proxied = false
  ttl     = 300
  comment = "SES DKIM (${each.value.domain}) — managed by fleetworks-web/infra"
}

# --- MAIL FROM: MX + SPF on bounce.<domain> -----------------------------------
resource "cloudflare_record" "mail_from_mx" {
  for_each = var.domains

  zone_id  = each.value.cloudflare_zone_id
  name     = "bounce.${each.key}"
  type     = "MX"
  content  = "feedback-smtp.${var.ses_region}.amazonses.com"
  priority = 10
  proxied  = false
  ttl      = 300
  comment  = "SES MAIL FROM MX (${each.key}) — managed by fleetworks-web/infra"
}

resource "cloudflare_record" "mail_from_spf" {
  for_each = var.domains

  zone_id = each.value.cloudflare_zone_id
  name    = "bounce.${each.key}"
  type    = "TXT"
  content = "v=spf1 include:amazonses.com ~all"
  proxied = false
  ttl     = 300
  comment = "SES MAIL FROM SPF (${each.key}) — managed by fleetworks-web/infra"
}

# --- DMARC --------------------------------------------------------------------
# LOCKED rollout: start p=quarantine; monitor `rua` aggregate reports until
# DKIM+SPF alignment is clean; then tighten to p=reject. The rua mailbox must
# exist before launch (see deploy/zitadel/README.md).
resource "cloudflare_record" "dmarc" {
  for_each = var.domains

  zone_id = each.value.cloudflare_zone_id
  name    = "_dmarc.${each.key}"
  type    = "TXT"
  content = "v=DMARC1; p=quarantine; rua=mailto:${each.value.dmarc_rua}; fo=1"
  proxied = false
  ttl     = 300
  comment = "DMARC (${each.key}) — managed by fleetworks-web/infra"
}
