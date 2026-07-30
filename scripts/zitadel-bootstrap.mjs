import pw from 'playwright'
const { chromium } = pw
import fs from 'node:fs'

const BASE = 'https://id.fleetworks.dev'
const INFRA = '/Volumes/dev-ssd/repos/personal/fleetworks-web/infra'
const PW = fs.readFileSync(`${INFRA}/zitadel-admin-password.txt`, 'utf8').trim()
const LOGIN = 'admin@fleetworks.id.fleetworks.dev'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// The console sends its OIDC access token on every gRPC-Web call — capture it
// from the wire rather than guessing at the storage layout.
let sniffed = null
page.on('request', (req) => {
  if (sniffed) return
  const auth = req.headers()['authorization']
  if (auth?.startsWith('Bearer ') && req.url().includes('/zitadel.')) sniffed = auth.slice(7)
})

await page.goto(`${BASE}/ui/console`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
await page.locator('input[name="loginName"], #loginName, input[type="text"]').first().fill(LOGIN)
await page.locator('button[type="submit"], #submit-button').first().click()
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
await page.locator('input[type="password"], #password').first().fill(PW)
await page.locator('button[type="submit"], #submit-button').first().click()
await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
await page.waitForTimeout(3000)
const skip = page.locator('button:has-text("Skip"), a:has-text("Skip")').first()
if (await skip.count()) {
  await skip.click()
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {})
}
await page.waitForTimeout(6000)
if (!page.url().includes('/ui/console')) throw new Error('did not reach console: ' + page.url())

await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
await page.waitForTimeout(5000)
const stored = await page.evaluate(() => {
  const keys = [...Array(localStorage.length).keys()].map((i) => localStorage.key(i))
  const direct = localStorage.getItem('access_token')
  if (direct) return direct
  for (const k of keys) {
    const v = localStorage.getItem(k)
    if (v && /^ey[A-Za-z0-9_-]+\./.test(v)) return v
  }
  return null
})
await browser.close()
const token = sniffed || stored
if (!token) throw new Error('no admin access token found (neither sniffed nor stored)')
console.log('got admin access token via', sniffed ? 'network sniff' : 'storage', '- len', token.length)

const api = async (path, body, method = 'POST') => {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json }
}

// ---- 1. terraform machine user (IAM_OWNER) + JWT key -------------------------
let r = await api('/management/v1/users/machine', {
  userName: 'terraform',
  name: 'Terraform Provider',
  description: 'IaC principal for the zitadel terraform provider',
  accessTokenType: 'ACCESS_TOKEN_TYPE_JWT',
})
console.log('create tf machine user:', r.status, JSON.stringify(r.json).slice(0, 200))
let tfUserId = r.json.userId
if (!tfUserId) {
  const list = await api('/management/v1/users/_search', { queries: [{ userNameQuery: { userName: 'terraform' } }] })
  tfUserId = list.json.result?.[0]?.id
  console.log('resolved existing tf user:', tfUserId)
}

r = await api('/admin/v1/members', { userId: tfUserId, roles: ['IAM_OWNER'] })
console.log('grant IAM_OWNER:', r.status, JSON.stringify(r.json).slice(0, 200))

r = await api(`/management/v1/users/${tfUserId}/keys`, { type: 'KEY_TYPE_JSON' })
console.log('create tf key:', r.status, Object.keys(r.json))
if (r.json.keyDetails) {
  fs.writeFileSync(`${INFRA}/zitadel-provider-key.json`, Buffer.from(r.json.keyDetails, 'base64'), { mode: 0o600 })
  console.log('wrote zitadel-provider-key.json')
}

// ---- 2. login-client machine user (IAM_LOGIN_CLIENT) + PAT -------------------
r = await api('/management/v1/users/machine', {
  userName: 'login-client',
  name: 'Fleetworks Login v2 Client',
  description: 'PAT principal for the self-hosted Login v2 UI',
  accessTokenType: 'ACCESS_TOKEN_TYPE_BEARER',
})
console.log('create login-client:', r.status, JSON.stringify(r.json).slice(0, 200))
let lcUserId = r.json.userId
if (!lcUserId) {
  const list = await api('/management/v1/users/_search', { queries: [{ userNameQuery: { userName: 'login-client' } }] })
  lcUserId = list.json.result?.[0]?.id
  console.log('resolved existing login-client:', lcUserId)
}

r = await api('/admin/v1/members', { userId: lcUserId, roles: ['IAM_LOGIN_CLIENT'] })
console.log('grant IAM_LOGIN_CLIENT:', r.status, JSON.stringify(r.json).slice(0, 200))

r = await api(`/management/v1/users/${lcUserId}/pats`, { expirationDate: '2099-01-01T00:00:00Z' })
console.log('create PAT:', r.status, Object.keys(r.json))
if (r.json.token) {
  fs.writeFileSync(`${INFRA}/zitadel-login-client.pat`, r.json.token, { mode: 0o600 })
  console.log('wrote zitadel-login-client.pat')
}

fs.writeFileSync(
  `${INFRA}/zitadel-ids.json`,
  JSON.stringify({ terraformUserId: tfUserId, loginClientUserId: lcUserId }, null, 2),
)
console.log('DONE')
