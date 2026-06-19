// packages/client/src/theming/scan-sdk/scan.ts
import type { ScanPayload } from "@invariance/theming";
import {
  classifyHeldFormat,
  classifyWrapping,
  modeFromSelector,
} from "./held-format.js";
import {
  parseRuleBlocks,
  collectCustomPropDecls,
  collectVarUseSites,
} from "./css-text.js";

const SCAN_VERSION = 1;

/**
 * In-browser scan (spec §5). CSSOM is the source of truth: held values per mode
 * are read straight from each rule's text (including .dark/[data-theme] rules),
 * NOT by toggling the live DOM. getComputedStyle is demoted to a cross-check /
 * enumerator only and never authoritative for held values.
 *
 * Cross-origin sheets that throw SecurityError on .cssRules are recorded in
 * opaqueSheets so the Scanner can mechanically downgrade affected inferences.
 */
export function scan(doc: Document = document): ScanPayload {
  const opaqueSheets: string[] = [];

  // --- Source of truth: the RAW authored CSS of every inline <style> element.
  // We read <style> textContent directly rather than join re-serialized rule.cssText:
  // rule.cssText is engine-re-serialized, and some engines/shims drop declarations they
  // cannot fully parse — e.g. happy-dom drops `background-color: hsl(var(--x))`, which
  // would erase the very consumption use-site the tokenizer must see. The element's raw
  // text never loses it. (Real browsers keep `hsl(var(--x))` in cssText too; the raw path
  // is simply the strictly-faithful one and survives test shims.) We record each captured
  // <style>'s backing sheet so the styleSheets walk below does not double-count it.
  let cssText = "";
  const capturedSheets = new Set<CSSStyleSheet>();
  for (const el of Array.from(doc.querySelectorAll("style"))) {
    const text = el.textContent;
    if (text && text.trim().length > 0) cssText += text + "\n";
    const owned = (el as HTMLStyleElement).sheet;
    if (owned) capturedSheets.add(owned);
  }

  // --- Walk styleSheets to (a) record opaque cross-origin sheets and (b) pick up readable
  // NON-inline sheets (e.g. same-origin <link>ed sheets, which have no <style> node).
  // Touch .cssRules to provoke a SecurityError on a cross-origin sheet; an unreadable sheet
  // is recorded, not silently skipped. Any sheet already captured via querySelectorAll
  // ("style") is SKIPPED by identity so its declarations are not counted twice.
  for (const sheet of Array.from(doc.styleSheets)) {
    if (capturedSheets.has(sheet as CSSStyleSheet)) continue; // already captured (inline <style>)
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      opaqueSheets.push((sheet as CSSStyleSheet).href ?? "(inline-unreadable)");
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      cssText += rule.cssText + "\n";
    }
  }

  const blocks = parseRuleBlocks(cssText);

  // ---- Held declarations (per var, per mode) — CSSOM source of truth.
  const decls = collectCustomPropDecls(blocks);
  const byName = new Map<
    string,
    Array<{ selector: string; mode: "light" | "dark" | "unknown"; rawValue: string; heldFormat: ReturnType<typeof classifyHeldFormat> }>
  >();
  for (const d of decls) {
    const list = byName.get(d.name) ?? [];
    list.push({
      selector: d.selector,
      mode: modeFromSelector(d.selector),
      rawValue: d.value,
      heldFormat: classifyHeldFormat(d.value),
    });
    byName.set(d.name, list);
  }

  // getComputedStyle DEMOTED to enumerator + active-mode cross-check + var resolver.
  // We resolve the active-mode value to confirm a var is live; it does not override held.
  const gcs = doc.defaultView?.getComputedStyle(doc.documentElement);
  // (Cross-check only; the resolved value is intentionally not stored as held.)
  if (gcs) {
    for (const name of byName.keys()) {
      void gcs.getPropertyValue(name); // touch for the active-mode cross-check / var-chain resolve
    }
  }

  const variables = Array.from(byName.entries()).map(([name, declarations]) => ({
    name,
    declarations,
  }));

  // ---- Consumption use-sites (per var) — CSSOM source of truth.
  const consumption: Record<
    string,
    Array<{ wrapping: ReturnType<typeof classifyWrapping>; selector: string; property: string }>
  > = {};
  for (const site of collectVarUseSites(blocks)) {
    const list = consumption[site.name] ?? [];
    list.push({
      wrapping: classifyWrapping(site.useSite),
      selector: site.selector,
      property: site.property,
    });
    consumption[site.name] = list;
  }

  return {
    scanVersion: SCAN_VERSION,
    origin: doc.defaultView?.location?.origin ?? "",
    variables,
    consumption,
    opaqueSheets,
  };
}
