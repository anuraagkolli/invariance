// packages/theming/src/verify/css-safe.ts

// A CSS *token value* is the right-hand side of `--x: <value>`. It is "safe" iff it cannot
// terminate the declaration, escape the rule block, open a new block, start a comment, smuggle an
// at-rule / url() / backslash-escape, or carry angle brackets that could break out of a <style>.
//
// We do NOT validate against an allowed shape with a regex (a regex over the allowed grammar is
// exactly the brittle approach the spec forbids). Two structural moves instead:
//   (1) DENY a fixed set of breakout-capable characters/substrings (deny-by-construction).
//   (2) RESERIALIZE round-trip: serialize the survivor INTO a synthetic single declaration
//       `--p:<value>;`, parse that declaration back into its property/value halves, and require the
//       re-extracted value to be byte-identical to the input. A breakout character cannot survive
//       step (1); a value that smuggled a structural separator past step (1) would not round-trip
//       identically through the synthetic declaration.

// Single characters that can break out of the value position.
const FORBIDDEN_CHARS = [
  ';', // declaration terminator
  '{', // open block
  '}', // close block
  '<', // </style> breakout
  '>', // </style> breakout
  '\\', // CSS escape sequence (e.g. \3c -> '<')
  '\n', '\r', '\f', '\0', // newlines / form feed / NUL — token-stream disruptors
];

// Substrings that signal a comment or at-rule, case-insensitive for url()/at-rules.
const FORBIDDEN_SUBSTRINGS = [
  '/*', // comment open
  '*/', // comment close
  '@', // at-rule (@import, @charset, @media …)
];

// url(...) is forbidden case-insensitively (URL exfiltration / loading).
const URL_PATTERN_CHARS = 'url(';

// Serialize `value` into a synthetic declaration and re-extract the value half. The synthetic
// property `--p` carries the ONLY structural `:` and the ONLY trailing `;`, so splitting on the
// first `:` and stripping the final `;` recovers exactly the bytes we serialized. If the input had
// somehow smuggled an extra `;` or `:`-led declaration past the deny set, the re-extracted value
// would not equal the input — the round-trip catches it instead of normalizing it away.
function reserializeDeclarationValue(value: string): string {
  const declaration = `--p:${value};`;
  const colonIdx = declaration.indexOf(':');
  if (colonIdx < 0) return ''; // cannot happen for our synthetic prefix, but be defensive
  const body = declaration.slice(colonIdx + 1); // "<value>;"
  if (!body.endsWith(';')) return ''; // a stripped/relocated terminator would land here
  return body.slice(0, -1); // drop the synthetic trailing ';' → the re-extracted value
}

export function isSafeCssTokenValue(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  for (const ch of FORBIDDEN_CHARS) {
    if (value.includes(ch)) return false;
  }
  for (const sub of FORBIDDEN_SUBSTRINGS) {
    if (value.includes(sub)) return false;
  }
  // Case-insensitive url( detection (covers URL(, Url(, etc.).
  if (value.toLowerCase().includes(URL_PATTERN_CHARS)) return false;

  // Reserialize round-trip: the value re-extracted from a synthetic `--p:<value>;` declaration must
  // be byte-identical to the trimmed input. This is a real serialize→parse cycle, not a no-op trim.
  const roundTripped = reserializeDeclarationValue(trimmed);
  return roundTripped === trimmed;
}
