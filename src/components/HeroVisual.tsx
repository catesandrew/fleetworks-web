import { otherSuiteApps } from '@fleet-works/suite-nav'
import styles from './HeroVisual.module.css'

/**
 * Short instrument-style labels for the diagram's satellite nodes. Purely a
 * display abbreviation — ids, URLs, and accent colors still come from
 * `@fleet-works/suite-nav`'s `suiteApps`, never a second hardcoded copy.
 */
const SHORT_LABEL: Record<string, string> = {
  'yellow-pages': 'YP',
  rolodex: 'RLDX',
  chorus: 'CHR',
  helmsman: 'HLM',
  warden: 'WRD',
}

const HUB_ID = 'fleetworks'
const CENTER = 180
const RADIUS = 140

/** Evenly spaces `count` points around a circle, starting at the top (12 o'clock). */
function pentagonPoint(index: number, count: number) {
  const angle = (-90 + (360 / count) * index) * (Math.PI / 180)
  return {
    x: Math.round(CENTER + RADIUS * Math.cos(angle)),
    y: Math.round(CENTER + RADIUS * Math.sin(angle)),
  }
}

export interface HeroVisualProps {
  /** Brand accent for this page — the diagram's single live signal (DESIGN.md's One Light Rule). */
  accentColor: string
  /** `suite-nav` id of the app to highlight as the active node/route. Omit for a neutral, hub-only view. */
  activeId?: string
}

/**
 * The Fleetworks apex hero graphic: a hub-and-spoke diagram of the 5 apps
 * orbiting the shared control plane, with exactly one node and its route lit
 * in the page's accent color. Chosen via `/impeccable live` variant
 * comparison against the home hero (see DESIGN.md, "Control Room" /
 * "Signal Map"); reused as-is across all 6 pages (home + 5 app pages) —
 * only `accentColor` and `activeId` change per page.
 */
export function HeroVisual({ accentColor, activeId }: HeroVisualProps) {
  const satellites = otherSuiteApps(HUB_ID)
  const activeApp = satellites.find((app) => app.id === activeId)
  const activeIndex = satellites.findIndex((app) => app.id === activeId)

  return (
    <div
      className={styles.diagram}
      style={{ '--hero-accent': accentColor } as React.CSSProperties}
    >
      <div className={styles.diagramInner}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
          role="img"
          aria-label={
            activeApp
              ? `Diagram of the Fleetworks suite: five apps connected to a central hub, with ${activeApp.name} highlighted as the active instrument`
              : 'Diagram of the Fleetworks suite: five apps connected to a central hub'
          }
        >
          {satellites.map((app, i) => {
            const { x, y } = pentagonPoint(i, satellites.length)
            const isActive = app.id === activeId
            return (
              <line
                key={`line-${app.id}`}
                className={isActive ? `${styles.line} ${styles.lineActive}` : styles.line}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
              />
            )
          })}
          <circle className={styles.hub} cx={CENTER} cy={CENTER} r={16} />
          {satellites.map((app, i) => {
            const { x, y } = pentagonPoint(i, satellites.length)
            const isActive = app.id === activeId
            const labelY = y < CENTER ? y - 14 : y + 22
            return (
              <g key={app.id}>
                <circle
                  className={isActive ? `${styles.node} ${styles.nodeActive}` : styles.node}
                  cx={x}
                  cy={y}
                  r={9}
                />
                <text className={styles.label} x={x} y={labelY} textAnchor="middle">
                  {SHORT_LABEL[app.id] ?? app.id.slice(0, 3).toUpperCase()}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {activeApp ? (
        <span className={styles.coord}>
          NODE {String(activeIndex + 1).padStart(2, '0')} · {activeApp.name.toUpperCase()} · ACTIVE
        </span>
      ) : null}
    </div>
  )
}
