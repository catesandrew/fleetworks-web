import { AppSwitcher } from '@fleet-works/ui'

/** Shared site header rendered once in the root layout — inherited by every page. */
export function AppHeader() {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--fw-color-border)',
        padding: 'var(--fw-space-3) var(--fw-space-5)',
      }}
    >
      <AppSwitcher currentId="fleetworks" />
    </header>
  )
}
