export interface NavItem {
  label: string
  href: string
  // Icon identifier (rendered as simple SVG icons inline)
  icon?: string
}

export interface User {
  name: string
  email: string
  initials: string
}

export interface Metric {
  id: string
  label: string
  value: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
}

export interface ChartData {
  title: string
  description?: string
  labels: string[]
  values: number[]
}

export interface FooterLink {
  label: string
  href: string
}
