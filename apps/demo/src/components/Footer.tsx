'use client'

import { m } from 'invariance'
import type { FooterLink } from '@/lib/types'

interface FooterProps {
  links: FooterLink[]
}

export function Footer({ links }: FooterProps) {
  const year = new Date().getFullYear()

  return (
    <m.slot name="footer" level={1}>
      <footer className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-white border-t border-gray-200 shrink-0">
        <p className="text-sm text-gray-600">
          <m.text name="footer-copyright">{`© ${year} Invariance Demo. All rights reserved.`}</m.text>
        </p>
        <nav aria-label="Footer links">
          <ul className="flex items-center gap-6">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </footer>
    </m.slot>
  )
}
