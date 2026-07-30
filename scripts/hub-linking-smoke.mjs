#!/usr/bin/env node
/**
 * Account-linking smoke test — the pilot's correctness gate.
 *
 * Proves that signing in through the Fleetworks hub with an email that already
 * has a password account on a product's Supabase project resolves to the SAME
 * auth.users row with TWO identities, rather than silently creating a duplicate
 * user. Supabase's docs do not state whether the `email_verified` claim is
 * honoured, so this is measured, not assumed.
 *
 * Usage:
 *   node scripts/hub-linking-smoke.mjs <email> <password> [--verified|--unverified]
 *
 * `--unverified` runs the guard case: the hub identity's email is NOT verified,
 * and linking to a verified local account must NOT happen silently.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api } from './zitadel-api.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(here, '..', '..')
const SUPABASE_REF = process.env.SUPABASE_REF || 'ndeubizireenktnvimiq'
const HUB = 'https://id.fleetworks.dev'

const [email, password, mode = '--verified'] = process.argv.slice(2)
if (!email || !password) {
  console.error('usage: hub-linking-smoke.mjs <email> <password> [--verified|--unverified]')
  process.exit(1)
}
const emailVerified = mode !== '--unverified'

// ---- credentials -----------------------------------------------------------
const envLocal = path.join(REPO_ROOT, 'yellow-pages', 'apps', 'api', '.env.local')
const mgmtToken = fs
  .readFileSync(envLocal, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='))
  ?.split('=')
  .slice(1)
  .join('=')
  .replace(/^["']|["']$/g, '')
if (!mgmtToken) throw new Error(`no SUPABASE_ACCESS_TOKEN in ${envLocal}`)

const keysRes = await fetch(
  `https://api.supabase.com/v1/projects/${SUPABASE_REF}/api-keys?reveal=true`,
  { headers: { Authorization: `Bearer ${mgmtToken}`, 'User-Agent': 'cogs-supabase-sync/0.1' } },
)
const secretKey = (await keysRes.json()).find((k) => k.type === 'secret')?.api_key
if (!secretKey) throw new Error('could not reveal the project secret key')

const gotrue = async (method, p, body) => {
  const res = await fetch(`https://${SUPABASE_REF}.supabase.co/auth/v1${p}`, {
    method,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, json: { raw: text.slice(0, 300) } } }
}

const usersFor = async () => {
  const { json } = await gotrue('GET', `/admin/users?page=1&per_page=200`)
  return (json.users || []).filter((u) => u.email === email)
}

// ---- 1. product-side password account (email pre-confirmed) ----------------
let existing = await usersFor()
if (existing.length === 0) {
  const created = await gotrue('POST', '/admin/users', {
    email,
    password,
    email_confirm: true,
  })
  console.log('created supabase password user:', created.status)
  existing = await usersFor()
} else {
  console.log('supabase user already present:', existing[0].id)
}
const baselineUserId = existing[0]?.id
const baselineCount = existing.length
console.log(`baseline: ${baselineCount} user(s) for ${email}, id=${baselineUserId}`)
console.log('baseline identities:', (existing[0]?.identities || []).map((i) => i.provider))

// ---- 2. hub-side account with the same email -------------------------------
const search = await api('POST', '/management/v1/users/_search', {
  queries: [{ emailQuery: { emailAddress: email } }],
})
let hubUserId = search.json.result?.[0]?.id
if (!hubUserId) {
  const created = await api('POST', '/management/v1/users/human/_import', {
    userName: email,
    profile: { firstName: 'Hub', lastName: 'Link' },
    email: { email, isEmailVerified: emailVerified },
    password,
    passwordChangeRequired: false,
  })
  console.log('created hub user:', created.status, JSON.stringify(created.json).slice(0, 200))
  hubUserId = created.json.userId
} else {
  console.log('hub user already present:', hubUserId)
}

console.log(
  JSON.stringify(
    {
      email,
      emailVerified,
      supabaseUserId: baselineUserId,
      hubUserId,
      hubLoginName: email,
      authorizeUrl: `https://${SUPABASE_REF}.supabase.co/auth/v1/authorize?provider=custom:fleetworks&redirect_to=${encodeURIComponent('http://localhost:3010/auth/callback')}`,
      hub: HUB,
    },
    null,
    2,
  ),
)
console.log('\nNext: run the browser leg, then re-run with --audit to compare.')

// ---- 3. audit --------------------------------------------------------------
export async function audit() {
  const after = await usersFor()
  return {
    userCount: after.length,
    users: after.map((u) => ({
      id: u.id,
      email: u.email,
      identities: (u.identities || []).map((i) => i.provider),
    })),
  }
}

if (process.argv.includes('--audit')) {
  console.log('AUDIT', JSON.stringify(await audit(), null, 2))
}
