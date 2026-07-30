#!/usr/bin/env node
// Call Zitadel's SYSTEM API (instance-level operations the admin API cannot do,
// e.g. registering an additional instance domain).
//
// Auth is a self-signed RS256 JWT presented directly as the bearer token — no
// token exchange. The keypair's PUBLIC half is registered in the server's
// ZITADEL_SYSTEMAPIUSERS secret; the private half is infra/zitadel-system-user.key
// (gitignored). `iss` and `sub` must equal the username in that config.
//
// Usage:
//   node scripts/zitadel-system-api.mjs POST /system/v1/instances/<id>/domains '{"domain":"account.fleetworks.dev"}'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DOMAIN = process.env.ZITADEL_DOMAIN || 'https://id.fleetworks.dev'
const USER = process.env.ZITADEL_SYSTEM_USER || 'systemuser'
const here = path.dirname(fileURLToPath(import.meta.url))
const KEY_FILE = process.env.ZITADEL_SYSTEM_KEY_FILE || path.join(here, '..', 'infra', 'zitadel-system-user.key')

const b64url = (buf) => Buffer.from(buf).toString('base64url')

export function systemToken() {
  const key = fs.readFileSync(KEY_FILE, 'utf8')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: USER, sub: USER, aud: DOMAIN, iat: now, exp: now + 3600 }))
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key))
  return `${header}.${payload}.${sig}`
}

export async function systemApi(method, apiPath, body) {
  const res = await fetch(DOMAIN + apiPath, {
    method,
    headers: { Authorization: `Bearer ${systemToken()}`, 'Content-Type': 'application/json' },
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
    console.error('usage: zitadel-system-api.mjs <METHOD> <path> [jsonBody]')
    process.exit(1)
  }
  const { status, json } = await systemApi(method, apiPath, body)
  console.log(status, JSON.stringify(json, null, 2).slice(0, 3000))
}
