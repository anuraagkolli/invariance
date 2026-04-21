# invariance

**Make your existing React/Next.js app customizable by end-users — with a single CLI command.**

One `invariance init`, and your app gets a natural-language customization panel, user-specific theme persistence, and hard guardrails (palette, font allowlist, required sections) that every change is verified against before it lands. No hand-written theming system. No admin UI. No rip-and-replace.

> **MVP (v0.1).** F1 style + F2 content + F3 layout + F4 component swap. F5+ source changes deferred.

---

## Install

```bash
npm install invariance
```

Requires Node 20+, Next.js 14+, React 18+. Tailwind 3+ is optional.

---

## Quickstart

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx invariance init ./my-next-app
echo 'NEXT_PUBLIC_ANTHROPIC_DEV_API_KEY=sk-ant-...' >> ./my-next-app/.env.local
cd my-next-app && npm run dev
```

Open the app, click the Invariance panel trigger, type *"make the sidebar dark blue"*.

---

## What `invariance init` does

Writes to your app:

- `invariance.config.yaml` — your invariants (all pages start locked at level 0)
- `invariance.theme.initial.json` — scanner-observed defaults
- `src/app/providers.tsx` — generated React provider + `<CustomizationPanel>`
- patches `src/app/layout.tsx` to mount `<Providers>`
- `.env.example` — reminder of the runtime env var
- wraps your JSX in `m.page` / `m.slot` / `m.text` and rewrites hardcoded values to `var(--inv-*)` CSS variable refs

---

## CLI commands

| Command | What it does |
|---------|--------------|
| `invariance init [path]` | Migrate and wire providers (recommended). |
| `invariance scan <path> [--apply]` | Analyze an app; dry-run unless `--apply`. |
| `invariance unlock <section>` | Adjust `invariance.config.yaml` after migration. |
| `invariance unlock --status` | Show current lock state. |

Sections: `colors`, `fonts`, `spacing`, `content`, `layout`, `components`, `page <route> --level N`, `all`.

---

## Full docs

The full README — customization levels, config reference, how the Gatekeeper/Builder pipeline works, API proxy pattern, programmatic API, troubleshooting — lives in the repo:

**https://github.com/anuraagkolli/invariance#readme**

---

## License

MIT
