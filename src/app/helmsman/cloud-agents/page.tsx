import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { getSuiteApp, type SuiteApp } from '@fleet-works/suite-nav'
import styles from './page.module.css'

function requireSuiteApp(id: string): SuiteApp {
  const app = getSuiteApp(id)
  if (!app) {
    throw new Error(`@fleet-works/suite-nav is missing its "${id}" entry`)
  }
  return app
}

const HELMSMAN_APP = requireSuiteApp('helmsman')

export const metadata: Metadata = {
  title: 'Cloud Agents',
  description:
    'Define an agent once, govern it once, run it on AWS or Azure — one permission model, one approval flow, one audit trail, one spend cap across both clouds.',
}

const CAPABILITIES = [
  {
    title: 'One definition, either cloud',
    body: 'Describe an agent once — its permissions, its model, the tools it may use. Change a single field to move that same definition from AWS to Azure. The spec does not fork per cloud.',
  },
  {
    title: 'One audit trail across both',
    body: 'Every invocation is recorded the same way — who ran it, what it cost, which tools it touched — whichever cloud executed it. The trail lives with Helmsman, not scattered across two vendors’ consoles.',
  },
  {
    title: 'Human approval, anywhere it runs',
    body: 'Multi-agent processes pause at the gates you define and wait for a person. Approve or reject from the dashboard or your phone, whether the step ran on AWS or Azure.',
  },
  {
    title: 'Tools stay governed at the boundary',
    body: 'An agent only ever reaches the tools you granted it — enforced by Helmsman as each call is made, not left to the runtime in the cloud. Credentials stay with the control plane and never travel to the workload.',
  },
  {
    title: 'Spend caps that refuse, not report',
    body: 'A per-organization ceiling that turns the next invocation away when it would cross the line — a control that stops spend, not a number you reconcile after the bill arrives.',
  },
]

export default function CloudAgentsPage() {
  return (
    <main
      className={styles.page}
      style={{ '--helmsman-accent': HELMSMAN_APP.accentColor } as CSSProperties}
    >
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Helmsman · Roadmap</p>
        <h1 className={styles.headline}>Define an agent once. Govern it on any cloud.</h1>
        <p className={styles.lede}>
          Cloud agents are moving out of pilots and into production &mdash; and each cloud governs
          only its own. Helmsman is extending its agent control plane across AWS and Azure so one
          permission model, one approval flow, one audit trail, and one spend cap hold across both.
        </p>
        <div className={styles.actions}>
          <a className={styles.btnPrimary} href="/request-demo">
            Request a demo →
          </a>
          <a className={styles.btnGhost} href="/helmsman">
            About Helmsman
          </a>
        </div>

        <div className={styles.diagramWrap}>
          <svg
            className={styles.diagram}
            viewBox="0 0 720 300"
            role="img"
            aria-label="An agent definition governed by Helmsman, running on either AWS or Azure under one control plane"
          >
            <defs>
              <marker
                id="ca-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="var(--fw-color-muted)" />
              </marker>
            </defs>

            {/* agent definition */}
            <rect
              x="16"
              y="118"
              width="132"
              height="64"
              rx="8"
              fill="var(--fw-color-paper)"
              stroke="var(--fw-color-border)"
            />
            <text
              x="82"
              y="145"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="11"
              fill="var(--fw-color-muted)"
            >
              agent
            </text>
            <text
              x="82"
              y="162"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="11"
              fill="var(--fw-color-muted)"
            >
              definition
            </text>

            <line
              x1="148"
              y1="150"
              x2="252"
              y2="150"
              stroke="var(--fw-color-muted)"
              strokeWidth="1.5"
              markerEnd="url(#ca-arrow)"
            />

            {/* helmsman control plane */}
            <rect
              x="256"
              y="70"
              width="216"
              height="160"
              rx="12"
              fill="var(--fw-color-paper)"
              stroke="var(--helmsman-accent, #2e62c9)"
              strokeWidth="1.5"
            />
            <text
              x="364"
              y="104"
              textAnchor="middle"
              fontFamily="'Bricolage Grotesque', sans-serif"
              fontSize="19"
              fontWeight="600"
              fill="var(--fw-color-ink)"
            >
              Helmsman
            </text>
            <text
              x="364"
              y="124"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="10.5"
              fill="var(--fw-color-muted)"
            >
              one control plane
            </text>
            <g
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="11.5"
              fill="var(--fw-color-ink)"
              textAnchor="middle"
            >
              <text x="364" y="156">
                permissions · approvals
              </text>
              <text x="364" y="176">
                audit · tool broker
              </text>
              <text x="364" y="196">
                spend caps
              </text>
            </g>

            {/* clouds */}
            <rect
              x="560"
              y="92"
              width="144"
              height="52"
              rx="8"
              fill="var(--fw-color-paper)"
              stroke="var(--fw-color-border)"
            />
            <text
              x="632"
              y="123"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="13"
              fill="var(--fw-color-ink)"
            >
              AWS
            </text>
            <rect
              x="560"
              y="156"
              width="144"
              height="52"
              rx="8"
              fill="var(--fw-color-paper)"
              stroke="var(--fw-color-border)"
            />
            <text
              x="632"
              y="187"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="13"
              fill="var(--fw-color-ink)"
            >
              Azure
            </text>

            {/* outbound: run */}
            <path
              d="M472,132 C512,132 520,118 556,118"
              fill="none"
              stroke="var(--helmsman-accent, #2e62c9)"
              strokeWidth="1.5"
              markerEnd="url(#ca-arrow)"
            />
            <path
              d="M472,168 C512,168 520,182 556,182"
              fill="none"
              stroke="var(--helmsman-accent, #2e62c9)"
              strokeWidth="1.5"
              markerEnd="url(#ca-arrow)"
            />

            {/* return: audit + usage */}
            <path
              d="M632,144 C632,236 460,244 388,232"
              fill="none"
              stroke="var(--fw-color-border)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              markerEnd="url(#ca-arrow)"
            />
            <text
              x="470"
              y="262"
              textAnchor="middle"
              fontFamily="'Fragment Mono', ui-monospace, monospace"
              fontSize="10.5"
              fill="var(--fw-color-muted)"
            >
              audit · usage · results
            </text>
          </svg>
          <p className={styles.diagramCaption}>one governance model &mdash; two clouds</p>
        </div>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>The idea</p>
          <h2 className={styles.sectionTitle}>
            Governance is the part no cloud sells across both.
          </h2>
          <p className={styles.thesis}>
            AWS governs agents on AWS. Azure governs agents on Azure. Neither governs across the
            other. For a team running work on both, that means two permission models to keep in
            sync, two audit trails to reconcile, and two places a runaway agent can spend before
            anyone notices.{' '}
            <span className={styles.muted}>
              Helmsman&rsquo;s answer is to make the governance neutral: define and permission an
              agent once, and let it run wherever it needs to &mdash; without the controls changing
              shape per cloud.
            </span>
          </p>
          <p className={styles.quote}>The agent is portable. So is the way you govern it.</p>
        </section>

        <section className={styles.section}>
          <p className={styles.sectionLabel}>What the cross-cloud plane is built to do</p>
          <ol className={styles.capList}>
            {CAPABILITIES.map((cap, i) => (
              <li key={cap.title} className={styles.cap}>
                <span className={styles.capNum} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.capTitle}>{cap.title}</h3>
                <p className={styles.capBody}>{cap.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.note}>
          <p className={styles.noteText}>
            Helmsman already runs agents, multi-agent processes, and human approval gates today,
            under one org-scoped audit model. Cross-cloud is the next layer &mdash;{' '}
            <span className={styles.muted}>
              built the way the rest of the control plane was: one governed capability at a time,
              proven before it ships, with the enforcement point inside Helmsman rather than the
              cloud it runs on.
            </span>
          </p>
        </div>

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>See it on your infrastructure.</h2>
          <div className={styles.ctaActions}>
            <a className={styles.btnPrimary} href="/request-demo">
              Request a demo →
            </a>
            <a className={styles.btnGhost} href={HELMSMAN_APP.url}>
              Open {HELMSMAN_APP.name} →
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
