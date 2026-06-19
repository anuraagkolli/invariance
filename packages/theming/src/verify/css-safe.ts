// packages/theming/src/verify/css-safe.ts
//
// A CSS *token value* is the right-hand side of `--x: <value>`. It is "safe" iff it POSITIVELY
// parses as one of the known-safe shapes the compiler actually emits. This is a POSITIVE
// parse-then-accept (spec §4.6: "parse-then-reserialize, not a regex") — a value is accepted only
// if it structurally matches an expected form; unknown values (including expression(), url(),
// comment injection, at-rules, etc.) are rejected because they fail every positive form.
//
// The four safe shapes:
//   1. Plain number        — finite number, purely numeric string (shape:"number")
//   2. Numeric channel triple — whitespace-separated tokens each being <number> or <number>%
//                              (shape:"triple" — bare hsl/rgb/oklch triples)
//   3. culori-parseable color — culori parse() returns non-null (hex, named, function forms)
//   4. Font-stack           — comma-separated CSS font identifiers/quoted strings, safe chars only
//
// A fast-reject of hard breakout characters is kept as defense-in-depth BEFORE the positive parse,
// but the positive parse alone is sufficient: expression(...) fails all four forms even without it.

import { parse as culoriParse } from 'culori';

// ---------------------------------------------------------------------------
// Fast-reject: defense-in-depth for unambiguous breakout characters/substrings.
// Removing this does NOT let expression() through — the positive parse rejects it.
// ---------------------------------------------------------------------------
const FAST_REJECT_CHARS = [
  ';', // declaration terminator
  '{', // open block
  '}', // close block
  '<', // </style> breakout
  '>', // </style> breakout
  '\\', // CSS backslash escape
  '\n', '\r', '\f', '\0', // newlines / form-feed / NUL
];
const FAST_REJECT_SUBSTRINGS = [
  '/*', // comment open
  '*/', // comment close
  '@', // at-rule
];

function fastReject(value: string): boolean {
  for (const ch of FAST_REJECT_CHARS) {
    if (value.includes(ch)) return true;
  }
  for (const sub of FAST_REJECT_SUBSTRINGS) {
    if (value.includes(sub)) return true;
  }
  if (value.toLowerCase().includes('url(')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Shape 1: Plain number — finite number, purely numeric string
// Accepts: "8", "0.5", "-2", "1.25"
// Rejects: "0.5rem", "expression(...)", anything with letters/parens
// ---------------------------------------------------------------------------
const PLAIN_NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

function isPlainNumber(s: string): boolean {
  if (!PLAIN_NUMBER_RE.test(s)) return false;
  const n = Number(s);
  return Number.isFinite(n);
}

// ---------------------------------------------------------------------------
// Shape 2: Numeric channel triple — whitespace-separated tokens each <number> or <number>%
// Accepts: "0 0% 100%", "240 5.9% 10%", "0 72.2% 50.6%", "0 0 0"
// Rejects: "expression(alert(1))" (tokens aren't numeric)
// ---------------------------------------------------------------------------
const NUMERIC_TOKEN_RE = /^-?(?:\d+\.?\d*|\.\d+)%?$/;

function isNumericChannelTriple(s: string): boolean {
  const tokens = s.trim().split(/\s+/);
  // Must have 2-4 tokens (covers rgb triples, hsl triples, possibly with alpha)
  if (tokens.length < 2 || tokens.length > 4) return false;
  return tokens.every(tok => NUMERIC_TOKEN_RE.test(tok));
}

// ---------------------------------------------------------------------------
// Shape 3: culori-parseable color
// Accepts: "#ffffff", "#fff", "oklch(0.62 0.19 29)", "hsl(0 0% 100%)", named colors
// Rejects: expression(...), url(...), and other non-color strings
// ---------------------------------------------------------------------------
function isCuloriColor(s: string): boolean {
  try {
    return culoriParse(s) !== undefined && culoriParse(s) !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shape 4: Font-stack — comma-separated CSS font names or quoted strings
// Each part may contain only: letters, digits, spaces, underscore, dot, hyphen, single/double quotes
// No parens, no semicolons, no braces, no @, no url, no slashes, no angle brackets, etc.
// Accepts: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
// Rejects: "expression(alert(1))" (contains parens)
// ---------------------------------------------------------------------------
const FONT_PART_SAFE_RE = /^[A-Za-z0-9 _.'\"-]+$/;

function isFontStack(s: string): boolean {
  const parts = s.split(',');
  if (parts.length === 0) return false;
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) return false; // trailing comma → empty part
    if (!FONT_PART_SAFE_RE.test(trimmed)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true iff `value` is a known-safe CSS token value — one that the theming compiler
 * actually emits and that cannot break out of a CSS value position.
 *
 * Safety is established by POSITIVE structural matching against the four emitted shapes.
 * Unknown values (breakouts, function calls, injection attempts) fail all four forms and are
 * therefore rejected without relying on any forbidden-pattern list.
 */
export function isSafeCssTokenValue(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Defense-in-depth fast-reject (does not substitute for positive parse).
  if (fastReject(trimmed)) return false;

  // Positive parse: SAFE iff exactly one shape matches.
  return (
    isPlainNumber(trimmed) ||
    isNumericChannelTriple(trimmed) ||
    isCuloriColor(trimmed) ||
    isFontStack(trimmed)
  );
}

// Exposed for testing: verify that the positive parse alone (without fast-reject) rejects
// expression() and other breakouts. This proves the positive parse is the real guard.
export function _positiveParseOnly(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return (
    isPlainNumber(trimmed) ||
    isNumericChannelTriple(trimmed) ||
    isCuloriColor(trimmed) ||
    isFontStack(trimmed)
  );
}
