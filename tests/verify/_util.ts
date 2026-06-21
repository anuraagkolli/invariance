// Shared test utilities. No engine internals — only generic helpers + a seeded PRNG
// so property-test failures are reproducible.

/** Deterministic stringify preserving INSERTION order (order-sensitive byte compare). */
export function rawStringify(x: unknown): string {
  return JSON.stringify(x);
}

/** Recursively key-sorted stringify (order-INsensitive value compare). */
export function sortedStringify(x: unknown): string {
  return JSON.stringify(sortDeep(x));
}

function sortDeep(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>).sort()) {
      out[k] = sortDeep((x as Record<string, unknown>)[k]);
    }
    return out;
  }
  return x;
}

/** mulberry32 — small, fast, seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rebuild an object/array tree with object keys inserted in randomized order. */
export function reinsertShuffled(x: unknown, rng: () => number): unknown {
  if (Array.isArray(x)) return x.map((v) => reinsertShuffled(v, rng));
  if (x && typeof x === "object") {
    const keys = Object.keys(x as Record<string, unknown>);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = reinsertShuffled((x as Record<string, unknown>)[k], rng);
    return out;
  }
  return x;
}

/**
 * Generate a random sparse StyleSpec-shaped delta that the wall ACCEPTS for SHADCN_CAN:
 * never touches the locked `primary` seed; fonts restricted to the "sans" allowlist id;
 * radius within [0, MAX_RADIUS_PX]. Returned as raw JSON (to flow through parseSpec).
 */
export function randomAcceptedDeltaJson(rng: () => number): Record<string, unknown> {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const oklch = (): string => {
    const l = (0.2 + rng() * 0.7).toFixed(3);
    const c = (rng() * 0.3).toFixed(3);
    const h = (rng() * 360).toFixed(2);
    return `oklch(${l} ${c} ${h})`;
  };
  const j: Record<string, unknown> = {};
  const colors: Record<string, unknown> = {};
  if (rng() < 0.6) colors.accent = oklch();
  if (rng() < 0.6) colors.neutral = oklch();
  if (rng() < 0.6) colors.destructive = oklch();
  if (Object.keys(colors).length > 0) j.colors = colors;
  if (rng() < 0.5) j.radius = Math.round(rng() * 24 * 1000) / 1000;
  if (rng() < 0.4) j.density = pick(["compact", "comfortable", "spacious"]);
  if (rng() < 0.3) j.typography = { body: "sans" };
  if (rng() < 0.3) j.mode = pick(["light", "dark", "both"]);
  return j;
}
