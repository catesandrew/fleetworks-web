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

## Hosting Login v2 on its own hostname

Upstream (compose, Helm) serves Login v2 under `/ui/v2/login` on the **same**
host as the API, because Zitadel resolves the virtual instance from the request
`Host` header. Fleetworks serves it on `account.fleetworks.dev` instead, which
needs one extra step or every login 500s with:

```
unable to set instance using origin &{account.fleetworks.dev account.fleetworks.dev https}
(ExternalDomain is id.fleetworks.dev): Instance not found
```

`account.fleetworks.dev` must be registered as an **instance domain** (System
API `AddDomain`). Things that do *not* fix it, tried and measured:

- **Trusted domains** (`POST /admin/v1/trusted_domains`) — different concept;
  the instance lookup still fails.
- **`CUSTOM_REQUEST_HEADERS=Host:id.fleetworks.dev`** — in `apps/login/src/proxy.ts`
  those headers are applied only on the *proxied* paths (`/oauth/`, `/oidc/`,
  `/.well-known/`, …), after the early return for login pages, so login routes
  never see them.
- Restarting Zitadel to clear the instance cache.

The login app's `getInstanceHost()` reads `x-zitadel-instance-host` →
`x-zitadel-forward-host` → `host`, and Fly passes the browser's `host`. So the
server has to accept that host, which is exactly what `AddDomain` does.

The System API needs a keypair that the admin API cannot create:

```bash
openssl genrsa -out infra/zitadel-system-user.key 2048
PUB=$(openssl rsa -in infra/zitadel-system-user.key -pubout | base64 | tr -d '\n')
fly secrets set -a fleetworks-zitadel "ZITADEL_SYSTEMAPIUSERS={\"systemuser\":{\"KeyData\":\"$PUB\"}}"
# then, after redeploy:
node scripts/zitadel-system-api.mjs POST /system/v1/instances/<instanceId>/domains \
  '{"domain":"account.fleetworks.dev"}'
```

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

## Account linking — measured, not assumed

Supabase's docs do not state whether the `email_verified` claim gates identity
linking, so the pilot measured it. `scripts/hub-linking-smoke.mjs` seeds a
password account on the product project and a hub account with the same email;
after a federated sign-in the project has:

```
id           = ed77ac12-…                (unchanged — no duplicate user)
identities   = email  +  custom:fleetworks
app_metadata = {"providers": ["email", "custom:fleetworks"]}
```

**Verified-email linking works: one `auth.users` row, two identities.** The hub
identity carries `email_verified: true`; the pre-existing password identity
reports `email_verified: false` in its identity_data even though
`email_confirmed_at` is set — do not use the identity claim as the source of
truth for local confirmation state.

**The unverified-email guard case could NOT be measured, and Supabase's
behaviour there remains unknown.** Zitadel refuses to let an unverified-email
user authenticate at all ("Initial User not supported"), and refuses to set a
password or verify the address on a user in `USER_STATE_INITIAL`. So this hub
structurally cannot emit an unverified-email identity — the risk is contained
upstream rather than by Supabase. If a future IdP (BYO-IdP, sub-project 5) can
assert an unverified email, re-run this guard before trusting it.

## Rollback

Measured against the live project:

| Lever | Effect on federated `/authorize` | Effect on password login |
| --- | --- | --- |
| `PUT /auth/v1/admin/custom-providers/custom:fleetworks` with `enabled:false` | **400 — blocked** | none |
| `custom_oauth_enabled: false` (Management API) | **no effect — still 302s to the hub** | none |
| Hide the button in the app | no server-side effect | none |

**`custom_oauth_enabled` is not a kill switch.** The provider's own `enabled`
flag is. Note the update is keyed by identifier (`custom:fleetworks`), not the
provider UUID, and a full payload is required — a partial `{"enabled":false}`
body is rejected with 400.

```bash
# disable (client_secret must be re-sent; it is write-only)
curl -X PUT "https://<ref>.supabase.co/auth/v1/admin/custom-providers/custom:fleetworks" \
  -H "apikey: $SECRET_KEY" -H "Authorization: Bearer $SECRET_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"provider_type":"oidc","identifier":"custom:fleetworks","name":"Fleetworks",
       "issuer":"https://id.fleetworks.dev","client_id":"…","client_secret":"…",
       "scopes":["openid","profile","email"],"enabled":false}'
```

## Adding the next app

1. `terraform apply` a second `zitadel_application_oidc` with that project's
   Supabase callback (`https://<ref>.supabase.co/auth/v1/callback`).
2. Register the provider on that project with `syncCustomOidcProvider`
   (`@cogs/supabase-sync`), using the new client id/secret.
3. Add its redirects to `uri_allow_list` — including the mobile scheme, which
   comes from the Expo app's `scheme`, NOT its bundle id (`yellowpages://**`,
   not `com.yellowpages.mobile://**`).
4. Add the web callback route + button, and the mobile `signInWithFleetworks`
   helper + button.

## Known follow-ups

- Fly Postgres here is **unmanaged** — no managed backups or DR. Move to
  `fly mpg` (Managed Postgres) before real accounts land in the hub.
- Instance branding sets Fleetworks gold (`#a26000`) but no logo: the provider
  uploads logos from a local file path and this repo has no exported raster of
  the Boxes mark. Export one and add `logo_path`/`icon_path` to
  `zitadel_default_label_policy`.
