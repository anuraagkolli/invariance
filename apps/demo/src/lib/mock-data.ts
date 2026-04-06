import type { NavItem, User, Metric, ChartData, FooterLink } from './types'

export const MOCK_USER: User = {
  name: 'Alex Kim',
  email: 'alex@acmecorp.com',
  initials: 'AK',
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'grid' },
  { label: 'Analytics', href: '/analytics', icon: 'bar-chart' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
  { label: 'Help', href: '/help', icon: 'help-circle' },
]

export const METRICS: Metric[] = [
  {
    id: 'revenue',
    label: 'Revenue',
    value: '$48,295',
    change: '+12.5%',
    trend: 'up',
  },
  {
    id: 'users',
    label: 'Active Users',
    value: '8,312',
    change: '+4.2%',
    trend: 'up',
  },
  {
    id: 'orders',
    label: 'Orders',
    value: '1,204',
    change: '-1.8%',
    trend: 'down',
  },
  {
    id: 'conversion',
    label: 'Conversion Rate',
    value: '3.6%',
    change: '+0.4%',
    trend: 'up',
  },
]

export const CHART_DATA: ChartData = {
  title: 'Revenue over time',
  description: 'Monthly revenue for the last 6 months',
  labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
  values: [32000, 38000, 41000, 35000, 44000, 48295],
}

export const FOOTER_LINKS: FooterLink[] = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Contact', href: '/contact' },
]
