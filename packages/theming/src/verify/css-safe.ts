// packages/theming/src/verify/css-safe.ts
//
// A CSS *token value* is the right-hand side of `--x: <value>`. It is "safe" iff it POSITIVELY
// parses as one of the known-safe shapes the compiler actually emits. This is a POSITIVE
// parse-then-accept (spec §4.6) — a value is accepted only if it structurally matches an expected
// form; unknown values (including expression(), url(), comment injection, at-rules, etc.) are
// rejected because they fail every positive form.
//
// The four safe shapes:
//   1. Plain number        — finite number, purely numeric string (shape:"number")
//   2. Numeric channel triple — whitespace-separated tokens each being <number> or <number>%
//                              (shape:"triple" — bare hsl/rgb/oklch triples)
//   3. culori-parseable color — culori parse() returns non-undefined (hex, named, function forms)
//   4. Font-stack           — comma-separated CSS font identifiers/quoted strings, safe chars only
//
// Lexical precondition (part of the positive parse): any value containing a C0 control character
// (U+0000–U+001F) or DEL (U+007F) is rejected BEFORE the four-form parse. A valid CSS token value
// the compiler emits never contains a raw control char. This closes the gap where culori tolerates
// internal whitespace control chars (e.g. `rgb(0\n0\n0)`) — _positiveParseOnly now rejects them.
//
// A fast-reject of hard breakout characters/substrings is kept as defense-in-depth BEFORE the
// positive parse, but is NOT the real guard — removing it must leave the function rejecting
// everything _positiveParseOnly rejects (including the control-char cases).
// The positive parse (with control-char precondition) is the structural guard.

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
// Note: culori.parse returns undefined (not null) on failure.
// ---------------------------------------------------------------------------
function isCuloriColor(s: string): boolean {
  try {
    const result = culoriParse(s);
    return result !== undefined;
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
// Lexical precondition: reject C0 control chars (U+0000–U+001F) and DEL (U+007F).
// A valid CSS token value the compiler emits never contains raw control chars.
// This closes the gap where culori tolerates internal control chars like `\n` in
// `rgb(0\n0\n0)` — it returns a parsed color even for such inputs.
// ---------------------------------------------------------------------------
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Positive parse: returns true iff `value` is a known-safe CSS token value — one that the theming
 * compiler actually emits and that cannot break out of a CSS value position.
 *
 * Safety is established by:
 *   1. Lexical precondition: no C0 control chars or DEL (closes culori's internal-whitespace gap).
 *   2. Positive structural matching against the four emitted shapes.
 *
 * Unknown values (breakouts, function calls, injection attempts) fail all four forms and are
 * therefore rejected without relying on any forbidden-pattern list. This is the real guard;
 * the fast-reject in isSafeCssTokenValue is redundant defense-in-depth only.
 */
export function _positiveParseOnly(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Lexical precondition: no raw control chars (C0 + DEL).
  if (hasControlChar(trimmed)) return false;
  return (
    isPlainNumber(trimmed) ||
    isNumericChannelTriple(trimmed) ||
    isCuloriColor(trimmed) ||
    isFontStack(trimmed)
  );
}

/**
 * Returns true iff `value` is a known-safe CSS token value.
 *
 * Delegates the structural check to _positiveParseOnly (the real guard).
 * The fast-reject is kept as redundant defense-in-depth only — removing it
 * must leave this function rejecting everything _positiveParseOnly rejects.
 */
export function isSafeCssTokenValue(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Defense-in-depth fast-reject — NOT the real guard; _positiveParseOnly is.
  if (fastReject(trimmed)) return false;

  return _positiveParseOnly(value);
}
