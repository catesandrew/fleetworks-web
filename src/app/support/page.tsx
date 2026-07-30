import type { Metadata } from 'next'
import { otherSuiteApps } from '@fleet-works/suite-nav'
import styles from './page.module.css'

// Apex support page. Each product's App Store listing points at that product's own
// /support; this is the hub, and the fallback for anyone who lands here first.
export const metadata: Metadata = {
  title: 'Support · Fleetworks',
  description: 'Get help with any app in the Fleetworks suite.',
}

const SUPPORT_EMAIL = 'catesandrew@gmail.com'

// Rendered from the shared registry rather than a second hardcoded list, so a new app
// in @fleet-works/suite-nav shows up here without anyone remembering to edit this page.
const APPS = otherSuiteApps('fleetworks')

export default function SupportPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.headline}>Support</h1>
        <p className={styles.sub}>
          Help for every app in the Fleetworks suite, on the web and on iOS.
        </p>

        <h2 className={styles.sectionHeadline}>Contact us</h2>
        <p className={styles.body}>
          Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.link}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and we aim to reply within two business days. Include your account email, which app
          you were using, and what you were doing when the problem happened.
        </p>

        <h2 className={styles.sectionHeadline}>Per-app support</h2>
        <p className={styles.body}>
          Each app has its own support page with sign-in help specific to it:
        </p>
        <ul className={styles.appList}>
          {APPS.map((app) => (
            <li key={app.id} className={styles.appItem}>
              <a href={`${app.url}/support`} className={styles.link}>
                <span className={styles.appName}>{app.name}</span>
              </a>{' '}
              <span className={styles.muted}>— {app.description}</span>
            </li>
          ))}
        </ul>

        <h2 className={styles.sectionHeadline}>Signing in</h2>
        <p className={styles.body}>
          The mobile apps are companions to their web applications, not standalone products —
          each one needs an account on that app&apos;s instance. Sign-in, sign-up, and password
          reset are protected by a Cloudflare Turnstile challenge, which normally resolves on
          its own within a few seconds; a restrictive corporate network or VPN can block it.
        </p>

        <h2 className={styles.sectionHeadline}>Deleting your account and data</h2>
        <p className={styles.body}>
          Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.link}>
            {SUPPORT_EMAIL}
          </a>{' '}
          from your account address, naming the app, and ask for deletion. Your account and the
          personal data attached to it are removed, and we confirm once it is done.
        </p>
      </div>
    </main>
  )
}
