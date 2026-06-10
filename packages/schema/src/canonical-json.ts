/**
 * Deterministic JSON serialization: object keys sorted lexicographically at
 * every depth. Signing and content-addressing both hash this form, so two
 * structurally equal bundles always produce the same hash and signature.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("cannot canonicalize non-finite number");
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`cannot canonicalize value of type ${typeof value}`);
  }
}
