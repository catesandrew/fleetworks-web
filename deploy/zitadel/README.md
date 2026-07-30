# Fleetworks Identity Hub — Zitadel runbook

The hub is a self-hosted [Zitadel](https://zitadel.com) instance that every
Fleetworks product app federates to. Products keep their own Supabase Auth as
the session authority; Zitadel is the upstream OIDC identity provider they
register as a **Custom OIDC provider** (`custom:fleetworks`).

| Piece | Where | Managed by |
| --- | --- | --- |
| Zitadel server | Fly.io app `fleetworks-zitadel` (region `sjc`) | `deploy/zitadel/fly.toml` |
| Postgres | Fly Postgres cluster `fleetworks-zitadel-db` | `fly postgres` (unmanaged) |
| `id.fleetworks.dev` CNAME | Cloudflare | `infra/hub-dns.tf` (`hub_records`) |
| Sending domain `auth.id.fleetworks.dev` | AWS SES us-east-2 | `infra/ses.tf`, `infra/dns.tf`, `infra/iam.tf` |
| Zitadel config (project, OIDC apps, SMTP, branding) | Zitadel | `infra/zitadel.tf` |

## The h2c finding — why this is on Fly and not Render

Zitadel requires a reverse proxy that forwards **HTTP/2 to the origin** (h2c).
The hub was first deployed on Render (`zitadel-lw5q.onrender.com`) and measured:

| Transport | Render | Fly |
| --- | --- | --- |
| OIDC discovery / authorize / token (plain HTTPS) | ✅ 200 | ✅ 200 |
| Zitadel console (gRPC-Web) | ✅ 21/21 calls, `grpc-status: 0` | ✅ |
| Connect-RPC over HTTP/1.1 | ✅ structured 401 JSON | ✅ |
| **Native gRPC** (`content-type: application/grpc`) | ❌ HTTP 404 `{"code":5,"message":"Not Found"}` | ✅ HTTP/2 200 + `Grpc-Status` trailers |

Render's edge terminates HTTP/2 and speaks HTTP/1.1 to the container, so a
native-gRPC request never reaches Zitadel's gRPC handler — its REST mux answers
instead, and returns a JSON 404. The same result came back on the raw
`.onrender.com` host, so it is Render's edge, not the custom domain. Render
documents HTTP/2 as a client-facing feature only.

Consequence: on Render the **console and login worked**, but the `zitadel`
Terraform provider (and any server-side gRPC SDK) could not talk to the hub at
all, so the config plane could not be managed as code. Fly's
`http_service.http_options.h2_backend = true` forwards h2c and fixes it.

**If you ever move hosts again, re-run this check before trusting the platform:**

```bash
printf '\x00\x00\x00\x00\x00' > /tmp/f.bin
curl -s --http2 -D - -o /dev/null -X POST \
  https://id.fleetworks.dev/zitadel.management.v1.ManagementService/GetMyOrg \
  -H 'content-type: application/grpc' -H 'te: trailers' --data-binary @/tmp/f.bin
```

Expect `HTTP/2 200`, `content-type: application/grpc`, and `Grpc-Status`
trailers. A JSON 404 body means the proxy is downgrading to HTTP/1.1.

## Secrets

None are committed. They live in Fly secrets, with local gitignored copies under
`infra/` for recovery:

| Secret | Fly secret name | Local copy |
| --- | --- | --- |
| Master key (32 chars, **immutable** — losing it loses all encrypted data) | `ZITADEL_MASTERKEY` | `infra/zitadel-masterkey.txt` |
| Zitadel DB user password | `ZITADEL_DATABASE_POSTGRES_USER_PASSWORD` | `infra/zitadel-db-password.txt` |
| Postgres superuser password | `ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD` | `infra/fly-postgres-superuser.txt` |
| First-instance admin password | `ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD` | `infra/zitadel-admin-password.txt` |
| Terraform machine-user JSON key | — | `infra/zitadel-provider-key.json` |
| Login v2 client PAT | — | `infra/zitadel-login-client.pat` |

> **Put `ZITADEL_MASTERKEY` in a password manager.** It cannot be rotated and
> without it the database is unreadable.

Admin login: `admin@fleetworks.id.fleetworks.dev` at
<https://id.fleetworks.dev/ui/console>.

## Bootstrap (one-time, per fresh instance)

Terraform cannot create its own credential, so this precedes `terraform apply`:

1. Log into the console as the first-instance admin.
2. Create a machine user `terraform`, grant it the **IAM_OWNER** instance role,
   generate a JSON key, save it to `infra/zitadel-provider-key.json`.
3. Create a machine user `login-client`, grant it **IAM_LOGIN_CLIENT**, create a
   PAT, save it to `infra/zitadel-login-client.pat`.
4. Read the default org id (`GET /admin/v1/orgs/default`) into
   `infra/terraform.tfvars` as `zitadel_org_id`.

`scripts/zitadel-bootstrap.mjs` automates steps 1–3 by driving the console with
Playwright and sniffing the admin access token off its own gRPC-Web calls.

## Deploy / upgrade

```bash
cd deploy/zitadel
# bump the pinned tag in fly.toml first
fly deploy -c fly.toml -a fleetworks-zitadel --ha=false
```

Upgrades are a tag bump plus a deploy; `start-from-init` runs the setup/migration
steps on boot and is safe to re-run. Check the release notes for required
manual migration steps before crossing a major version.

## Config plane

```bash
cd infra
export AWS_PROFILE=workloom AWS_REGION=us-east-2
set -a; source ~/../Volumes/dev-ssd/repos/personal/.envrc; set +a
export TF_VAR_cloudflare_api_token=$CLOUDFLARE_API_TOKEN \
       TF_VAR_cloudflare_account_id=$CLOUDFLARE_ACCOUNT_ID
~/.local/bin/terraform-1.15.8 apply
```

**Terraform 1.15.8, not the system 1.5.7.** The zitadel provider marks
`zitadel_email_provider_smtp.password` write-only, which needs Terraform ≥ 1.11;
Homebrew's `terraform` formula is frozen at 1.5.7 because of the BUSL relicense.
This root's state key (`fleetworks/hub`) is separate from every other repo's, so
nothing else is pulled forward to the newer version.

## Known follow-ups

- Fly Postgres here is **unmanaged** — no managed backups or DR. Move to
  `fly mpg` (Managed Postgres) before real accounts land in the hub.
- Instance branding sets Fleetworks gold (`#a26000`) but no logo: the provider
  uploads logos from a local file path and this repo has no exported raster of
  the Boxes mark. Export one and add `logo_path`/`icon_path` to
  `zitadel_default_label_policy`.
