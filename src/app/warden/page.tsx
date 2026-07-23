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

const WARDEN_APP = requireSuiteApp('warden')

export default function WardenPage() {
  return (
    <main className={styles.hero} style={{ '--warden-accent': WARDEN_APP.accentColor } as CSSProperties}>
      <div className={styles.grid}>
        <div>
          <h1 className={styles.headline}>The governed front door to your cloud.</h1>
          <p className={styles.sub}>
            Warden is the governed front door to your Terraform Cloud footprint &mdash;
            workspaces, AWS/Azure accounts, and the services that own them &mdash; with org-scoped
            reads, guarded writes, and a deterministic config review.
          </p>
          <ul className={styles.features}>
            <li className={styles.featureItem}>
              Workspace CRUD &mdash; create, list, and update VCS provider/tenant &mdash; plus a
              deterministic config review that surfaces findings per workspace.
            </li>
            <li className={styles.featureItem}>
              Org-scoped visibility into the AWS and Azure accounts and services an org owns, with
              onboarding state.
            </li>
            <li className={styles.featureItem}>
              Scoped API tokens and outbound webhooks (with test delivery and delivery history) for
              integrating workspace events elsewhere.
            </li>
            <li className={styles.featureItem}>
              Every endpoint requires a Supabase JWT or a scoped PAT &mdash; a deliberate deviation
              from the reference Terraform Cloud API spec&rsquo;s public endpoints, so one org
              never sees another&rsquo;s data.
            </li>
          </ul>
          <p className={styles.audience}>
            Built for platform/DevOps engineers and org admins managing Terraform Cloud workspaces
            and AWS/Azure accounts &mdash; fluent in Terraform and cloud consoles, expecting the
            same nouns (workspace, service, account, tenant, region, provider) rather than
            web-only synonyms.
          </p>
          <div className={styles.actions}>
            <a className={styles.btnPrimary} href={WARDEN_APP.url}>
              Open {WARDEN_APP.name} →
            </a>
          </div>
        </div>
        <HeroVisual accentColor={WARDEN_APP.accentColor} activeId="warden" />
      </div>
    </main>
  )
}
