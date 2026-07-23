import type { CSSProperties } from 'react'
import { getSuiteApp, type SuiteApp } from '@fleet-works/suite-nav'
import { HeroVisual } from '@/components/HeroVisual'
import styles from './page.module.css'

function requireSuiteApp(id: string): SuiteApp {
  const app = getSuiteApp(id)
  if (!app) {
    throw new Error(`@fleet-works/suite-nav is missing its "${id}" entry`)
  }
  return app
}

const CHORUS_APP = requireSuiteApp('chorus')

export default function ChorusPage() {
  return (
    <main className={styles.hero} style={{ '--chorus-accent': CHORUS_APP.accentColor } as CSSProperties}>
      <div className={styles.grid}>
        <div>
          <h1 className={styles.headline}>DNS, opt-in by default.</h1>
          <p className={styles.sub}>
            Chorus manages every A/CNAME/TXT/SRV record and domain an org owns &mdash; with
            per-record unix-style permissions, a public directory for records teams choose to
            expose, and webhook-driven automation. Private by default; publishing is a deliberate,
            guarded action.
          </p>
          <ul className={styles.features}>
            <li className={styles.featureItem}>
              Full CRUD over A/CNAME/TXT/SRV records and domains, org-scoped, via API and
              dashboard.
            </li>
            <li className={styles.featureItem}>
              chmod-style permissions (9-bit mode, owner/group/other) on every record &mdash;
              private by default, with publishing a deliberate, guarded action.
            </li>
            <li className={styles.featureItem}>
              A public directory/search surface for records teams have chosen to publish;
              org-private data never leaks.
            </li>
            <li className={styles.featureItem}>
              A deterministic record linter flagging bad A-record IPs, malformed/apex CNAMEs,
              oversized TXT records, TTL bounds, and public records that expose internal IPs.
            </li>
          </ul>
          <p className={styles.audience}>
            Built for teams managing DNS records and domains across an org, who need per-record
            ownership and controlled, opt-in publishing rather than an all-or-nothing DNS admin
            panel.
          </p>
          <div className={styles.actions}>
            <a className={styles.btnPrimary} href={CHORUS_APP.url}>
              Open {CHORUS_APP.name} →
            </a>
          </div>
        </div>
        <HeroVisual accentColor={CHORUS_APP.accentColor} activeId="chorus" />
      </div>
    </main>
  )
}
