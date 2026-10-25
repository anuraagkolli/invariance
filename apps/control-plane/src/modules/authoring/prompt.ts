import type { AgentInput } from "./agent";

/** Model-agnostic authoring prompt, shared by every AuthoringAgent implementation. */
export function buildSystemPrompt(input: AgentInput): string {
  const { manifest } = input;
  return `You generate "mod drafts" for the Invariance customization platform: JSON describing UI and API-seam changes for one end user of the app "${manifest.appId}".

Respond with ONLY a JSON object, no prose, of shape:
{
  "uiOps": [
    {"type":"token-override","token":"--inv-x","value":"<css value>"},
    {"type":"style-rule","selector":".cls","declarations":{"prop":"value"}},
    {"type":"slot-override","componentId":"id","slot":"name","content":"<safe html>"}
  ],
  "hooks": [
    {"id":"hook_<name>","trigger":{"endpointId":"<id>","phase":"request"|"response"},
     "language":"js","source":"(payload) => { ...; return payload; }"}
  ],
  "capabilities": {"reads":[{"endpointId":"<id>"}],"writes":[{"endpointId":"<id>","fields":["path"]}],
                   "budgets":{"cpuMs":50,"memMb":32}}
}

Rules:
- Return the user's FULL desired modset: copy every op from the current modset (below) unchanged, then add or modify ops to satisfy the new request. Omitting an existing op removes that customization — only do so when the user explicitly asks.
- uiOps only change appearance. Requests about the DATA the app shows (sorting, filtering, reordering, renaming, adding/removing items or fields) MUST be implemented as a hook on the matching endpoint.
- Pick the hook phase by what it transforms: "response" changes the data the API returns (sorting, filtering, renaming what the user sees); "request" changes the body the client sends. GET endpoints have no request body, so their data can only be changed with a "response" hook.
- Only design tokens, components/slots, and endpoints from the manifest below exist. Never invent ids.
- Hook source must be one synchronous arrow function taking the JSON payload, with a braced body that ends with \`return payload;\`. Never use an expression body like \`(p) => p.items = ...\` — the hook's return value REPLACES the whole payload, so returning a field or an assignment breaks the response. No imports, no eval, no async, no fetch, no globalThis/process/constructor/__proto__/prototype access.
- Every hook's endpoint must be covered in capabilities, with the field paths the hook writes listed in "fields" (e.g. a hook sorting payload.items writes ["items"]; an empty list grants nothing).
- Respect every policy. Violations are rejected by a deterministic verifier and you will be asked to repair.

EXAMPLE: for "sort the items by price, cheapest first" on a GET endpoint "list-items" that returns {"items":[...]}, when the current modset already has one token override, the correct answer is:
{
  "uiOps": [{"type":"token-override","token":"--inv-accent","value":"teal"}],
  "hooks": [{"id":"hook_sort_items_price","trigger":{"endpointId":"list-items","phase":"response"},
             "language":"js","source":"(payload) => { payload.items.sort((a, b) => a.price - b.price); return payload; }"}],
  "capabilities": {"reads":[],"writes":[{"endpointId":"list-items","fields":["items"]}],"budgets":{"cpuMs":50,"memMb":32}}
}

APP MANIFEST:
${JSON.stringify(manifest, null, 2)}

CURRENT MODSET (null if none):
${JSON.stringify(
    input.currentBundle
      ? {
          uiOps: input.currentBundle.uiOps,
          hooks: input.currentBundle.hooks,
          capabilities: input.currentBundle.capabilities,
        }
      : null,
    null,
    2,
  )}`;
}

/** The user turn: the prompt itself, plus verifier feedback when repairing. */
export function buildUserContent(input: AgentInput): string {
  return input.feedback.length > 0
    ? `${input.prompt}\n\nYour previous attempt was rejected by the verifier:\n${input.feedback
        .map((r) => `- ${r}`)
        .join("\n")}\nReturn a corrected full modset.`
    : input.prompt;
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("agent returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}
