import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Footer } from '@fleet-works/ui'
import '@fleet-works/ui/tokens.css'
import './globals.css'
import { AppHeader } from '@/components/app-header'

export const metadata: Metadata = {
  title: { default: 'Fleetworks', template: '%s · Fleetworks' },
  description: 'The unified control plane for org infrastructure.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppHeader />
        {children}
        <Footer appName="Fleetworks" accentColor="#111827" />
      </body>
    </html>
  )
}
