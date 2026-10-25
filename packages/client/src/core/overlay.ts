import type { ModBundle, UiOp } from "@invariance/schema";

const STYLE_EL_ID = "invariance-overlay-styles";
export const DEFAULT_SCOPE_ATTRIBUTE = "data-invariance-root";

export type SlotOverrideMap = Map<string, string>;

export function slotKey(componentId: string, slot: string): string {
  return `${componentId}::${slot}`;
}

function escapeCssValue(value: string): string {
  return value.replace(/[;{}]/g, "");
}

function scopeSelector(selector: string, scopeAttribute: string): string {
  return selector
    .split(",")
    .map((part) => `[${scopeAttribute}] ${part.trim()}`)
    .join(", ");
}

export interface AppliedOverlay {
  tokens: Record<string, string>;
  slotOverrides: SlotOverrideMap;
}

/**
 * Applies a verified bundle's UI ops to the document: token overrides become
 * CSS custom properties on :root, style rules are emitted scoped under the
 * provider's scope attribute, slot overrides are returned for the component
 * layer (React) to render. Idempotent: re-applying replaces the previous
 * overlay entirely.
 */
export function applyOverlay(
  bundle: ModBundle,
  scopeAttribute: string = DEFAULT_SCOPE_ATTRIBUTE,
): AppliedOverlay {
  const tokens: Record<string, string> = {};
  const slotOverrides: SlotOverrideMap = new Map();
  const cssBlocks: string[] = [];

  for (const op of bundle.uiOps as UiOp[]) {
    switch (op.type) {
      case "token-override":
        tokens[op.token] = op.value;
        break;
      case "style-rule": {
        const body = Object.entries(op.declarations)
          .map(([prop, value]) => `${prop}: ${escapeCssValue(value)};`)
          .join(" ");
        cssBlocks.push(`${scopeSelector(op.selector, scopeAttribute)} { ${body} }`);
        break;
      }
      case "slot-override":
        slotOverrides.set(slotKey(op.componentId, op.slot), op.content);
        break;
    }
  }

  clearOverlay();
  const root = document.documentElement;
  for (const [token, value] of Object.entries(tokens)) {
    root.style.setProperty(token, escapeCssValue(value));
  }
  root.setAttribute("data-invariance-tokens", JSON.stringify(Object.keys(tokens)));
  if (cssBlocks.length > 0) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_EL_ID;
    styleEl.textContent = cssBlocks.join("\n");
    document.head.appendChild(styleEl);
  }
  return { tokens, slotOverrides };
}

/** Removes every trace of the overlay, restoring base appearance. */
export function clearOverlay(): void {
  const root = document.documentElement;
  const applied = root.getAttribute("data-invariance-tokens");
  if (applied) {
    try {
      for (const token of JSON.parse(applied) as string[]) {
        root.style.removeProperty(token);
      }
    } catch {
      // Attribute corrupted: nothing more we can safely remove.
    }
    root.removeAttribute("data-invariance-tokens");
  }
  document.getElementById(STYLE_EL_ID)?.remove();
}
