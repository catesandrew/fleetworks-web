#!/usr/bin/env node
/**
 * Register the `custom:fleetworks` OIDC provider on a product app's Supabase
 * project, and open the redirect allow-list for its web + mobile surfaces.
 *
 * This is the Task-5 half of adding an app to the hub, and it is the same shape
 * @cogs/supabase-sync implements — kept here as the operational driver because
 * it needs per-repo tokens and Terraform outputs that the library deliberately
 * does not reach for.
 *
 * Custom providers are NOT part of the Supabase Management API; they live on the
 * project's own GoTrue admin API and authenticate with the project SECRET key.
 * Updates are keyed by IDENTIFIER (`custom:fleetworks`), not the provider UUID.
 *
 * Usage: node scripts/register-fleetworks-provider.mjs <app-slug>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..', '..')

const APPS = {
  helmsman: { repo: 'helmsman', ref: 'pirxdjptpztugycwqkpv', site: 'https://helmsman.fleetworks.dev', scheme: 'helmsman' },
  rolodex: { repo: 'rolodex', ref: 'dcnxtuxejfimbynxvrod', site: 'https://rolodex.fleetworks.dev', scheme: 'rolodex' },
  warden: { repo: 'warden', ref: 'ciagzldhsaawapiltxoe', site: 'https://warden.fleetworks.dev', scheme: 'warden' },
  chorus: { repo: 'chorus', ref: 'wrrngqvkhnxcomdjsxht', site: 'https://chorus.fleetworks.dev', scheme: 'chorus' },
}

const slug = process.argv[2]
const app = APPS[slug]
if (!app) {
  console.error(`usage: register-fleetworks-provider.mjs <${Object.keys(APPS).join('|')}>`)
  process.exit(1)
}

const clientId = JSON.parse(fs.readFileSync('/tmp/ids.json', 'utf8'))[slug]
const clientSecret = JSON.parse(fs.readFileSync('/tmp/secrets.json', 'utf8'))[slug]
if (!clientId || !clientSecret) throw new Error(`no terraform output for ${slug}`)

const envLocal = path.join(ROOT, app.repo, 'apps', 'api', '.env.local')
const mgmtToken = fs
  .readFileSync(envLocal, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='))
  ?.split('=')
  .slice(1)
  .join('=')
  .replace(/^["']|["']$/g, '')
if (!mgmtToken) throw new Error(`no SUPABASE_ACCESS_TOKEN in ${envLocal}`)

const mgmt = (p, init = {}) =>
  fetch(`https://api.supabase.com${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mgmtToken}`,
      'User-Agent': 'cogs-supabase-sync/0.1',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

const keys = await (await mgmt(`/v1/projects/${app.ref}/api-keys?reveal=true`)).json()
const secretKey = keys.find((k) => k.type === 'secret')?.api_key
if (!secretKey) throw new Error('could not reveal the project secret key')

const gotrue = async (method, p, body) => {
  const res = await fetch(`https://${app.ref}.supabase.co/auth/v1${p}`, {
    method,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json }
}

const payload = {
  provider_type: 'oidc',
  identifier: 'custom:fleetworks',
  name: 'Fleetworks',
  issuer: 'https://id.fleetworks.dev',
  client_id: clientId,
  client_secret: clientSecret,
  scopes: ['openid', 'profile', 'email'],
}

const existing = (await gotrue('GET', '/admin/custom-providers')).json?.providers ?? []
const already = existing.some((p) => p.identifier === 'custom:fleetworks')
const wrote = already
  ? await gotrue('PUT', '/admin/custom-providers/custom:fleetworks', payload)
  : await gotrue('POST', '/admin/custom-providers', payload)
console.log(`  provider ${already ? 'updated' : 'created'}: ${wrote.status} ${wrote.json?.identifier ?? JSON.stringify(wrote.json).slice(0, 140)}`)

// Redirect allow-list: the web callback plus the Expo scheme. The mobile scheme
// comes from the app's `scheme`, NOT its bundle id — makeRedirectUri() builds
// from `scheme`, and a mismatch here rejects the deep link.
const cfg = await (await mgmt(`/v1/projects/${app.ref}/config/auth`)).json()
const wanted = [`${app.site}/auth/callback`, `${app.scheme}://**`]
const list = new Set(
  String(cfg.uri_allow_list ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
for (const w of wanted) list.add(w)

const patched = await mgmt(`/v1/projects/${app.ref}/config/auth`, {
  method: 'PATCH',
  body: JSON.stringify({ custom_oauth_enabled: true, uri_allow_list: [...list].join(',') }),
})
const after = await patched.json()
console.log(`  custom_oauth_enabled: ${after.custom_oauth_enabled}`)
console.log(`  uri_allow_list: ${after.uri_allow_list}`)
