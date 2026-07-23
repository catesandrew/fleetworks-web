import type { CSSProperties } from 'react'
import { getSuiteApp, otherSuiteApps, type SuiteApp } from '@fleet-works/suite-nav'
import { HeroVisual } from '@/components/HeroVisual'
import styles from './page.module.css'

function requireSuiteApp(id: string): SuiteApp {
  const app = getSuiteApp(id)
  if (!app) {
    throw new Error(`@fleet-works/suite-nav is missing its "${id}" entry`)
  }
  return app
}

const HOME_APP = requireSuiteApp('fleetworks')
const SUITE_APPS = otherSuiteApps('fleetworks')

export default function HomePage() {
  return (
    <>
      <main
        className={styles.hero}
        style={{ '--home-accent': HOME_APP.accentColor } as CSSProperties}
      >
        <div className={styles.grid}>
          <div>
            <h1 className={styles.headline}>One control plane for six moving parts.</h1>
            <p className={styles.sub}>
              Fleetworks catalogs, connects, deploys, and governs your org&rsquo;s infrastructure
              &mdash; one accent light live at a time.
            </p>
            <div className={styles.actions}>
              <a className={styles.btnPrimary} href="/request-demo">
                Request a demo
              </a>
              <a className={styles.btnGhost} href="https://yp.fleetworks.dev">
                Open Yellow Pages →
              </a>
            </div>
          </div>
          <HeroVisual accentColor={HOME_APP.accentColor} activeId="yellow-pages" />
        </div>
      </main>

      <section className={styles.narrative}>
        <div className={styles.narrativeInner}>
          <h2 className={styles.sectionHeadline}>One control plane, not five admin panels.</h2>
          <p className={styles.narrativeBody}>
            Instead of five different internal tools with five different auth models and five
            different ideas of what a &ldquo;service&rdquo; is, Fleetworks gives every team one
            consistent way to catalog, observe, and act on the systems they run &mdash; from the
            services themselves down to DNS, identity, deployments, and the cloud infrastructure
            underneath.
          </p>
          <p className={styles.narrativeBody}>
            Register a service in Yellow Pages, and its DNS in Chorus, its deployments in
            Helmsman, its cloud accounts in Warden, and its owning team&rsquo;s directory data in
            Rolodex all resolve back to the same source of truth &mdash; one consistent
            unix-style permission model (owner/group/other) and org-scoping throughout, instead
            of five different bespoke admin panels.
          </p>
        </div>
      </section>

      <section className={styles.appsSection}>
        <div className={styles.appsInner}>
          <h2 className={styles.sectionHeadline}>The suite</h2>
          <div className={styles.appsGrid}>
            {SUITE_APPS.map((app) => (
              <a
                key={app.id}
                className={styles.appTile}
                href={`/${app.id}`}
                style={{ '--tile-accent': app.accentColor } as CSSProperties}
              >
                <span className={styles.appTileDot} aria-hidden="true" />
                <span className={styles.appTileName}>{app.name}</span>
                <span className={styles.appTileDescription}>{app.description}</span>
                <span className={styles.appTileHost}>{new URL(app.url).host}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div className={styles.ctaInner}>
          <h2 className={styles.sectionHeadline}>See the whole suite running live.</h2>
          <p className={styles.narrativeBody}>
            Fleetworks is heading toward public beta, with live demos of each app available now
            &mdash; this is a working suite, not a concept.
          </p>
          <a className={styles.btnPrimary} href="/request-demo">
            Request a demo
          </a>
        </div>
      </section>
    </>
  )
}
