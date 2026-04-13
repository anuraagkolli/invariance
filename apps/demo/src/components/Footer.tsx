import { m } from "invariance";
import type { FooterLink } from '@/lib/types'

interface FooterProps {
  links: FooterLink[]
}

export function Footer({ links }: FooterProps) {
  const year = new Date().getFullYear()

  return (
    <m.slot name="footer" level={0} preserve={true} cssVariables={['--inv-footer-bg', '--inv-footer-border', '--inv-footer-text', '--inv-footer-text-1', '--inv-footer-pad', '--inv-footer-pad-1']}><footer className="flex flex-wrap items-center justify-between gap-[var(--inv-footer-pad)] px-[var(--inv-footer-pad-1)] py-[var(--inv-footer-pad)] bg-[var(--inv-footer-bg)] border-t border-[var(--inv-footer-border)] shrink-0">
            <p className="text-sm text-[var(--inv-footer-text)]">
              {`© ${year} Acme Inc. All rights reserved.`}
            </p>
            <nav aria-label="Footer links">
              <ul className="flex items-center gap-[var(--inv-footer-pad)]">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-[var(--inv-footer-text-1)] hover:text-gray-800 transition-colors"
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
