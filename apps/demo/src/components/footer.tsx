const COLUMNS: { heading: string; links: string[] }[] = [
  { heading: 'Browse', links: ['Movies', 'Series', 'Nebula Originals', 'New Releases', 'My List'] },
  { heading: 'Company', links: ['About', 'Careers', 'Press', 'Newsroom', 'Investors'] },
  { heading: 'Support', links: ['Help Center', 'Account', 'Devices', 'Accessibility', 'Contact Us'] },
]

// Muted footer in text-secondary, with the provenance line. Uses footer slot
// tokens so a theme can darken/recolor the footer band on its own.
export function Footer() {
  return (
    <footer
      className="border-t bg-[var(--inv-footer-bg)] px-6 py-12 text-[var(--inv-footer-text)] sm:px-10"
      style={{ borderColor: 'var(--inv-border)' }}
    >
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.heading} className="flex flex-col gap-2">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-textDisabled">
              {col.heading}
            </h3>
            {col.links.map((link) => (
              <a
                key={link}
                href="#"
                className="text-sm text-[var(--inv-footer-text)] transition-colors hover:text-textPrimary"
              >
                {link}
              </a>
            ))}
          </div>
        ))}
      </div>

      <div
        className="mt-10 flex flex-col gap-2 border-t pt-6 text-xs text-textDisabled sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--inv-border)' }}
      >
        <span className="font-display uppercase tracking-[0.3em] text-textSecondary">Nebula</span>
        <span>Built with Invariance · © {new Date().getFullYear()} Nebula Media, Inc.</span>
      </div>
    </footer>
  )
}
