import { m } from 'invariance'

export default function Home() {
  return (
    <m.page name="home">
      <aside className="bg-[var(--inv-sidebar-bg)] text-white p-4">Sidebar</aside>
      <main>Hello</main>
    </m.page>
  )
}
