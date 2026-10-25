import type { InvarianceFetchConfig } from '@invariance/server'

// Business-logic plane config. getSubject matches the header the console's
// Guardrails + the demo use (x-demo-user). appId "nebula" matches the manifest.
export const invarianceServerConfig: InvarianceFetchConfig = {
  registryUrl: process.env.INVARIANCE_REGISTRY ?? 'http://localhost:4400',
  appId: 'nebula',
  getSubject: (req: Request) => req.headers.get('x-demo-user') ?? undefined,
}
