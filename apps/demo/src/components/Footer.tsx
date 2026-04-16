import { m } from "invariance";
import type { FooterLink } from '@/lib/types'

interface FooterProps {
  links: FooterLink[]
}

export function Footer({ links }: FooterProps) {
  const year = new Date().getFullYear()

  return (
    <m.slot name="section-6" level={0} preserve={true} cssVariables={['--inv-section-6-bg', '--inv-section-6-border', '--inv-section-6-text', '--inv-section-6-text-1', '--inv-section-6-pad', '--inv-section-6-pad-1']}><footer className="flex flex-wrap items-center justify-between gap-[var(--inv-section-6-pad)] px-[var(--inv-section-6-pad-1)] py-[var(--inv-section-6-pad)] bg-[var(--inv-section-6-bg)] border-t border-[var(--inv-section-6-border)] shrink-0">
            <p className="text-sm text-[var(--inv-section-6-text)]">
              {`© ${year} Acme Inc. All rights reserved.`}
            </p>
            <nav aria-label="Footer links">
              <ul className="flex items-center gap-[var(--inv-section-6-pad)]">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-[var(--inv-section-6-text-1)] hover:text-gray-800 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </footer></m.slot>
  )
}
