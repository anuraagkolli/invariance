// Fresh-process compile probe. Run via tsx in a spawned process (optionally under a
// mutated locale/TZ) so cross-process nondeterminism — global state seeded at module
// load, Map/Object iteration order, locale/number/timezone drift — surfaces as a byte
// difference against the in-process baseline. Prints canonical JSON to stdout.
import { compile, parseSpec } from "@invariance/theming";
import { DRAFTS, SHADCN_CAN, TWO_MODE_CAN } from "./_fixtures.js";

function compileAll(manifest: Parameters<typeof compile>[1]) {
  return DRAFTS.map((d) => {
    const parsed = parseSpec(d.json, manifest);
    if (!parsed.ok) throw new Error(`child: draft ${d.name} rejected: ${JSON.stringify(parsed.failures)}`);
    return { name: d.name, theme: compile(parsed.spec, manifest) };
  });
}

const result = { shadcn: compileAll(SHADCN_CAN), twoMode: compileAll(TWO_MODE_CAN) };
process.stdout.write(JSON.stringify(result));
