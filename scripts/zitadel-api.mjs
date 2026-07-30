#!/usr/bin/env node
// Call the Zitadel API as the `terraform` machine user (IAM_OWNER), using the
// JWT-profile key at infra/zitadel-provider-key.json. No browser, no PAT.
//
// This is also the BREAK-GLASS path: if an interactive-login misconfiguration
// locks you out of the console, this still works and can revert the change.
//
// Usage:
//   node scripts/zitadel-api.mjs GET /admin/v1/orgs/default
//   node scripts/zitadel-api.mjs PUT /v2/features/instance '{"loginV2":{...}}'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOMAIN = process.env.ZITADEL_DOMAIN || 'https://id.fleetworks.dev'
const here = path.dirname(fileURLToPath(import.meta.url))
const KEY_FILE = process.env.ZITADEL_KEY_FILE || path.join(here, '..', 'infra', 'zitadel-provider-key.json')

const b64url = (buf) => Buffer.from(buf).toString('base64url')

export async function getToken() {
  const key = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: key.keyId }))
  const payload = b64url(
    JSON.stringify({ iss: key.userId, sub: key.userId, aud: DOMAIN, iat: now, exp: now + 3600 }),
  )
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key.key))
  const assertion = `${header}.${payload}.${signature}`

  const res = await fetch(`${DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
      scope: 'openid profile urn:zitadel:iam:org:project:id:zitadel:aud',
    }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`token request failed: ${res.status} ${JSON.stringify(body)}`)
  return body.access_token
}

export async function api(method, apiPath, body, token) {
  const t = token || (await getToken())
  const res = await fetch(DOMAIN + apiPath, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 500) } }
  return { status: res.status, json }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method = 'GET', apiPath, body] = process.argv.slice(2)
  if (!apiPath) {
    console.error('usage: zitadel-api.mjs <METHOD> <path> [jsonBody]')
    process.exit(1)
  }
  const { status, json } = await api(method, apiPath, body)
  console.log(status, JSON.stringify(json, null, 2).slice(0, 4000))
}
