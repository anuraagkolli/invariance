'use client'

import { m } from "invariance";
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { Dashboard } from '@/components/Dashboard'
import { Footer } from '@/components/Footer'
import { NAV_ITEMS, MOCK_USER, METRICS, CHART_DATA, FOOTER_LINKS } from '@/lib/mock-data'

export default function Page() {
  return (
    <m.page name="home"><div className="flex h-full">
            <m.slot name="section-1" level={0} preserve={true}><Sidebar navigationItems={NAV_ITEMS} user={MOCK_USER} /></m.slot>
            <m.slot name="section-2" level={0}><div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <Header title="Dashboard" notificationCount={3} />
                        <Dashboard metrics={METRICS} chartData={CHART_DATA} />
                        <Footer links={FOOTER_LINKS} />
                      </div></m.slot>
          </div></m.page>
  )
}
