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

const YELLOW_PAGES_APP = requireSuiteApp('yellow-pages')

export default function YellowPagesPage() {
  return (
    <main
      className={styles.hero}
      style={{ '--yellow-pages-accent': YELLOW_PAGES_APP.accentColor } as CSSProperties}
    >
      <div className={styles.grid}>
        <div>
          <h1 className={styles.headline}>The authoritative catalog of everything you run.</h1>
          <p className={styles.sub}>
            Yellow Pages is the backbone of the Fleetworks suite &mdash; the registry of every
            service, team, and cloud account in the org, and the source of truth the rest of the
            suite links back to.
          </p>
          <ul className={styles.features}>
            <li className={styles.featureItem}>
              Full CRUD over six core resources &mdash; Service (~93 fields), Agent, Team, AWS
              Account, Azure Account, and Label &mdash; via REST API and admin web UI.
            </li>
            <li className={styles.featureItem}>
              chmod-style RBAC (owner/group/other, 9-bit mode) on every resource, with
              public-readable defaults and admin bypass; anonymous callers see only published rows.
            </li>
            <li className={styles.featureItem}>
              API keys, outbound webhooks (HMAC-signed), and bidirectional connectors (Coastguard,
              DNS, and the SaaS tools you already run) that read AND write back through governed,
              typed actions &mdash; Yellow Pages sits above your existing stack, not instead of it.
            </li>
            <li className={styles.featureItem}>
              Cross-resource search backed by a unified semantic graph &mdash; services, teams,
              accounts, and agents correlated across the whole suite, one operational data model
              every app and agent reasons against.
            </li>
          </ul>
          <p className={styles.audience}>
            Built for external, multi-tenant developers and platform/ops engineers self-serving
            through the web console &mdash; fluent in dev tooling, expecting the console to mirror
            concepts they already know (services, teams, cloud accounts, labels) rather than
            reinvent them.
          </p>
          <div className={styles.actions}>
            <a className={styles.btnPrimary} href={YELLOW_PAGES_APP.url}>
              Open {YELLOW_PAGES_APP.name} →
            </a>
          </div>
        </div>
        <HeroVisual accentColor={YELLOW_PAGES_APP.accentColor} activeId="yellow-pages" />
      </div>
    </main>
  )
}
