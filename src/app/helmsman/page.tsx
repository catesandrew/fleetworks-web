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

const HELMSMAN_APP = requireSuiteApp('helmsman')

export default function HelmsmanPage() {
  return (
    <main className={styles.hero} style={{ '--helmsman-accent': HELMSMAN_APP.accentColor } as CSSProperties}>
      <div className={styles.grid}>
        <div>
          <h1 className={styles.headline}>Deployments and agents, one audit trail.</h1>
          <p className={styles.sub}>
            Helmsman is the control plane for deployments and agentic workloads &mdash;
            applications, CI/CD pipelines, cluster deployments, and the agents and multi-agent
            processes doing the work &mdash; all under one org-scoped RBAC and audit model.
          </p>
          <ul className={styles.features}>
            <li className={styles.featureItem}>
              Application lifecycle management (quotas, namespace ownership, compliance controls)
              plus CI/CD pipeline, run, and deployment tracking across clusters.
            </li>
            <li className={styles.featureItem}>
              Agents as a governed resource: define, invoke (real OpenAI/Claude runtimes,
              per-agent routing), and audit every run.
            </li>
            <li className={styles.featureItem}>
              Multi-agent processes &mdash; sequential, concurrent, handoff, and supervisor
              topologies, with human-in-the-loop approval gates.
            </li>
            <li className={styles.featureItem}>
              A governed registry of MCP tool servers that agents can use, plus two-way sync with
              Yellow Pages.
            </li>
          </ul>
          <p className={styles.audience}>
            Built for platform/DevOps engineers managing application deployments, CI/CD, and the
            agents and automated processes running alongside them, under a single audited RBAC
            model.
          </p>
          <div className={styles.actions}>
            <a className={styles.btnPrimary} href={HELMSMAN_APP.url}>
              Open {HELMSMAN_APP.name} →
            </a>
          </div>
        </div>
        <HeroVisual accentColor={HELMSMAN_APP.accentColor} activeId="helmsman" />
      </div>
    </main>
  )
}
