export default function HomePage() {
  return (
    <div style={{ backgroundColor: '#ffffff' }}>
      <aside style={{ backgroundColor: '#1a1a2e', color: '#ffffff', padding: '16px' }}>
        <h1>Acme</h1>
      </aside>
      <main style={{ backgroundColor: '#ffffff', padding: '32px' }}>
        <h2>Welcome</h2>
        {/* Dark body copy on white: 17:1 contrast — the text-primary candidate. */}
        <p style={{ color: '#1a1a2e' }}>The quick brown fox.</p>
        {/* Second neutral surface — surface-1 (nearest L to the white page bg). */}
        <div style={{ backgroundColor: '#f3f4f6', padding: '16px' }}>
          {/* Chromatic accent (OKLCH C ~ 0.16) with solved white-on-accent text. */}
          <button style={{ backgroundColor: '#e94560', color: '#ffffff' }}>Buy now</button>
        </div>
      </main>
    </div>
  )
}
