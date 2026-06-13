import { Shell } from '../components/shell'

export default function HomePage() {
  return (
    <Shell>
      <section style={{ background: '#1f2225', color: '#f4f9ff', padding: '32px', borderRadius: '8px' }}>
        <h1>Tonight&apos;s picks</h1>
      </section>
      <section style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <article style={{ background: '#1f2225', color: '#f4f9ff', width: '168px', height: '252px' }}>
            <span>Orbit</span>
          </article>
          <article style={{ background: '#1f2225', color: '#f4f9ff', width: '168px', height: '252px' }}>
            <span>Drift</span>
          </article>
        </div>
      </section>
    </Shell>
  )
}
