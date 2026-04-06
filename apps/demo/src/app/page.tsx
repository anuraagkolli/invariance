'use client'

import { useState } from 'react'
import { InvarianceProvider, CustomizationPanel } from 'invariance'
import type { InvarianceConfig } from 'invariance'

import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { Dashboard } from '@/components/Dashboard'
import { Footer } from '@/components/Footer'
import { BarChart } from '@/components/charts/BarChart'
import { LineChart } from '@/components/charts/LineChart'
import { AreaChart } from '@/components/charts/AreaChart'
import { NAV_ITEMS, MOCK_USER, METRICS, CHART_DATA, FOOTER_LINKS } from '@/lib/mock-data'

const config: InvarianceConfig = {
  app: 'demo-dashboard',
  frontend: {
    design: {
      colors: { mode: 'any' },
      fonts: { allowed: ['Inter', 'Inter Tight', 'system-ui', 'monospace'] },
      spacing: { scale: [0, 4, 8, 12, 16, 24, 32, 48, 64] },
    },
    structure: {
      required_sections: ['header', 'main-content', 'footer'],
      locked_sections: [],
      section_order: { first: 'header', last: 'footer' },
    },
    accessibility: {
      wcag_level: 'AA',
      color_contrast: '>= 4.5',
      all_images: 'must have alt text',
    },
    pages: {
      '/': { level: 4, required: ['sidebar', 'header'] },
    },
  },
}

const componentLibrary = { BarChart, LineChart, AreaChart }

const MOCK_USERS = [
  { id: 'user-a', name: 'Alice' },
  { id: 'user-b', name: 'Bob' },
  { id: 'user-c', name: 'Charlie' },
]

export default function Page() {
  const [userId, setUserId] = useState('user-a')

  return (
    <InvarianceProvider
      key={userId}
      config={config}
      apiKey={process.env['NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY'] || ''}
      userId={userId}
      componentLibrary={componentLibrary}
      storage="api"
      storageUrl="/api/invariance"
    >
      <div className="flex h-full">
        <Sidebar navigationItems={NAV_ITEMS} user={MOCK_USER} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            title="Dashboard"
            notificationCount={3}
            userId={userId}
            users={MOCK_USERS}
            onUserChange={setUserId}
          />
          <Dashboard metrics={METRICS} chartData={CHART_DATA} />
          <Footer links={FOOTER_LINKS} />
        </div>
      </div>
      <CustomizationPanel />
    </InvarianceProvider>
  )
}
