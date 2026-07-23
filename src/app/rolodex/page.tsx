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

const ROLODEX_APP = requireSuiteApp('rolodex')

export default function RolodexPage() {
  return (
    <main className={styles.hero} style={{ '--rolodex-accent': ROLODEX_APP.accentColor } as CSSProperties}>
      <div className={styles.grid}>
        <div>
          <h1 className={styles.headline}>One directory, every person and group.</h1>
          <p className={styles.sub}>
            Rolodex is a read-only directory-lookup service that unifies Active Directory and
            Workday user/group data &mdash; plus SSH keys and outbound access provisioning &mdash;
            behind one API.
          </p>
          <ul className={styles.features}>
            <li className={styles.featureItem}>
              GET lookups for users and groups by sAMAccountName, distinguishedName, DSS username,
              employee number, or objectGUID, plus name/email/company search.
            </li>
            <li className={styles.featureItem}>
              Nested-group directory with member counts, and SSH public key lookup by user or
              group.
            </li>
            <li className={styles.featureItem}>
              Access provisioning: group membership drives outbound GitHub/Azure DevOps/GitLab
              access grants via a pull reconciler (additive, report-only, preview-gated).
            </li>
            <li className={styles.featureItem}>
              Admin portal surfaces for service-account PATs, webhooks, and directory sync, plus
              an unauthenticated public search subtree.
            </li>
          </ul>
          <p className={styles.audience}>
            Built for engineers and internal services that need directory data via API, and org
            admins managing directory sync, service-account tokens, and access grants through the
            portal.
          </p>
          <div className={styles.actions}>
            <a className={styles.btnPrimary} href={ROLODEX_APP.url}>
              Open {ROLODEX_APP.name} →
            </a>
          </div>
        </div>
        <HeroVisual accentColor={ROLODEX_APP.accentColor} activeId="rolodex" />
      </div>
    </main>
  )
}
