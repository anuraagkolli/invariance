// packages/theming/test/verify/verify.test.ts
import { describe, it, expect } from 'vitest';
import { verify } from '../../src/verify/index.js';
import type { AppManifest } from '../../src/manifest/index.js';
import type { CandidateTheme } from '../../src/compile/index.js';

// A minimal AA manifest: white background, black foreground (contrast ~21, well over AA text 4.5),
// one locked derived role (card pinned to white), chromaCap 0.4, modes light+dark allowed.
// Values are bare hsl triples (Shape:"triple", space:"hsl") to exercise the re-parse path.
const baseLight: Record<string, string> = {
  background: '0 0% 100%',
  foreground: '0 0% 0%',
  card: '0 0% 100%',
  'card-fg': '0 0% 0%',
  primary: '0 0% 0%',
  'primary-fg': '0 0% 100%',
  popover: '0 0% 100%',
  'popover-fg': '0 0% 0%',
  secondary: '0 0% 96%',
  'secondary-fg': '0 0% 0%',
  accent: '0 0% 96%',
  'accent-fg': '0 0% 0%',
  destructive: '0 60% 40%', // white-on-red ~ 7.22 (clears AA text 4.5 AND AAA text 7.0); chroma ~ 0.16 < cap
  'destructive-fg': '0 0% 100%',
  muted: '0 0% 96%',
  'muted-fg': '0 0% 40%',
  ring: '0 0% 0%',
};

function emitTriple(_role: string): { shape: 'triple'; space: 'hsl'; precision: number } {
  return { shape: 'triple', space: 'hsl', precision: 3 };
}

const variables: AppManifest['variables'] = Object.fromEntries(
  Object.keys(baseLight).map((role) => [`--${role}`, { role, emit: emitTriple(role), confidence: 'confirmed' as const }]),
);

const manifest = {
  appId: 'test',
  manifestVersion: 1,
  vocabVersion: 'iv-roles-1',
  profileVersion: 'iv-profile-1',
  variables,
  modes: {
    allowed: ['light', 'dark'] as ('light' | 'dark')[],
    default: 'light' as const,
    selectors: { light: ':root', dark: '.dark' },
  },
  base: { light: baseLight, dark: baseLight },
  defaultSeeds: {
    colors: { primary: '0 0% 0%', accent: '0 0% 96%', neutral: '0 0% 100%', destructive: '0 60% 40%' },
    radius: 0.5,
    density: 'comfortable' as const,
  },
  invariants: {
    contrastTier: 'AA' as const,
    chromaCap: 0.4,
    locks: ['card'],
    allowedFonts: [{ id: 'sans', stack: 'ui-sans-serif, system-ui, sans-serif' }],
  },
} as unknown as AppManifest;

// Build a clean candidate that simply emits base verbatim into the var-keyed maps.
function cleanCandidate(): CandidateTheme {
  const toVars = (b: Record<string, string>) =>
    Object.fromEntries(Object.entries(b).map(([role, v]) => [`--${role}`, v]));
  return { light: toVars(baseLight), dark: toVars(baseLight), meta: { vocabVersion: 'iv-roles-1', profileVersion: 'iv-profile-1' } };
}

describe('verify (the gate)', () => {
  it('passes a clean candidate that emits base verbatim', () => {
    const v = verify(cleanCandidate(), manifest);
    expect(v.ok).toBe(true);
  });

  it('fails contrast_floor when a foreground is pushed just under the floor', () => {
    const c = cleanCandidate();
    // foreground -> mid-grey on white: re-parsed contrast ~ 3.98 < AA text 4.5 (verified via culori).
    c.light['--foreground'] = '0 0% 50%';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor');
      expect(f).toBeDefined();
      expect(f!.mode).toBe('light');
      expect(f!.required).toBe(4.5);
      expect(f!.actual!).toBeLessThan(4.5);
      expect(f!.pair).toBeDefined();
    }
  });

  it('fails locked_drift when a locked var diverges from base', () => {
    const c = cleanCandidate();
    c.light['--card'] = '0 0% 90%'; // card is locked to '0 0% 100%'
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'locked_drift');
      expect(f).toBeDefined();
      expect(f!.role).toBe('card');
      expect(f!.varName).toBe('--card');
    }
  });

  it('fails chroma_cap when an emitted color exceeds the cap', () => {
    const c = cleanCandidate();
    // Inject a function-shaped oklch with chroma 0.45 > cap 0.4 directly into accent. reparseToOklch
    // passes a function-wrapped value through as-is (regardless of the var's emit.space), so the
    // re-parsed chroma is exactly 0.45 (verified via culori). The only contrast pair touching accent
    // is (accent-fg, accent); accent-fg stays black `0 0% 0%`, and black on oklch(0.7 0.45 30) is
    // ~6.28 (clears AA 4.5, verified via culori) — so the lone failure surfaced is chroma_cap.
    c.light['--accent'] = 'oklch(0.7 0.45 30)';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'chroma_cap');
      expect(f).toBeDefined();
      expect(f!.varName).toBe('--accent');
      expect(f!.mode).toBe('light');
      expect(f!.required).toBe(0.4);
      expect(f!.actual!).toBeGreaterThan(0.4);
    }
  });

  it('fails mode_not_allowed when an emitted mode is not in manifest.modes.allowed', () => {
    const lightOnly = {
      ...manifest,
      modes: { ...manifest.modes, allowed: ['light'] as ('light' | 'dark')[] },
    } as unknown as AppManifest;
    const v = verify(cleanCandidate(), lightOnly); // candidate still emits dark
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'mode_not_allowed');
      expect(f).toBeDefined();
      expect(f!.mode).toBe('dark');
    }
  });

  it('fails unsafe_value when an emitted value contains a CSS breakout', () => {
    const c = cleanCandidate();
    c.light['--foreground'] = '0 0% 0%; } body { display:none';
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'unsafe_value');
      expect(f).toBeDefined();
      expect(f!.varName).toBe('--foreground');
      expect(f!.mode).toBe('light');
    }
  });

  it('raises the floor to AAA when manifest tier is AAA', () => {
    const aaa = {
      ...manifest,
      invariants: { ...manifest.invariants, contrastTier: 'AAA' as const, locks: [] },
    } as unknown as AppManifest;
    const c = cleanCandidate();
    // grey 0 0% 35% on white: re-parsed contrast ~ 6.98 — passes AA (4.5) but fails AAA text (7.0)
    c.light['--foreground'] = '0 0% 35%';
    c.dark!['--foreground'] = '0 0% 35%';
    const v = verify(c, aaa);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const f = v.failures.find((x) => x.code === 'contrast_floor');
      expect(f!.required).toBe(7);
    }
  });

  it('reports the failing mode for a dark-only contrast regression', () => {
    const c = cleanCandidate();
    c.dark!['--foreground'] = '0 0% 50%'; // only dark fails (re-parsed contrast ~ 3.98 < 4.5)
    const v = verify(c, manifest);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const dark = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'dark');
      const light = v.failures.find((x) => x.code === 'contrast_floor' && x.mode === 'light');
      expect(dark).toBeDefined();
      expect(light).toBeUndefined();
    }
  });
});
