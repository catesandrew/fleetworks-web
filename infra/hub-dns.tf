# Explicit browser-facing CNAMEs for the auth hub → Render.
#
# `id.fleetworks.dev` (Zitadel API/console) and `account.fleetworks.dev` (the
# branded Login v2 fork) would otherwise be caught by the zone's
# `*.fleetworks.dev` A wildcard (→ Vercel), which 404s with
# DEPLOYMENT_NOT_FOUND. These explicit records win over the wildcard.
#
# proxied = false: Render holds the verified custom domain and issues its own
# TLS cert. Orange-clouding would also break Zitadel's h2c/gRPC-Web transport.
#
# Targets are only known after the Render services exist (Task 2 / Task 4), so
# each entry is opt-in — an unset entry creates no record, letting `terraform
# apply` succeed for the SES plane before the hub is deployed.
variable "hub_records" {
  description = <<-EOT
    Browser-facing hub CNAMEs, keyed by the host label written into the
    fleetworks.dev zone (`id`, `account`). Value = the `<service>.onrender.com`
    host that serves it. Omit a key to skip creating that record.
  EOT
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for _, target in var.hub_records : endswith(target, ".onrender.com")])
    error_message = "Each hub_records target must be a <service>.onrender.com host."
  }
}

resource "cloudflare_record" "hub" {
  for_each = var.hub_records

  zone_id = one([for _, d in var.domains : d.cloudflare_zone_id])
  name    = each.key
  type    = "CNAME"
  content = each.value
  proxied = false
  ttl     = 1
  comment = "fleetworks auth hub (${each.key}) -> Render (overrides *.fleetworks.dev Vercel wildcard)"
}
