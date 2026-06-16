import type { OnboardingSection } from "@invariance/schema";
import type { RawSection } from "./scan";

/**
 * Heuristic semantic naming for segmented sections (the `[LLM]` step in
 * ONBOARDING-PIPELINE.md is advisory; this deterministic proposer keeps the
 * flow offline). Names + levels are suggestions — the developer edits them in
 * the wizard before finalize, and the runtime gates re-enforce regardless.
 *
 * Level ladder (DesignSurface 0–4): 0 locked · 1 theme/style · 2 + content ·
 * 3 + layout · 4 + components.
 */

interface Proposal {
  name: string;
  level: number;
  aliases: string[];
  description: string;
}

function proposeFor(tag: string, index: number, count: number): Proposal {
  const t = tag.toLowerCase();
  if (t === "nav" || /navbar|navigation/.test(t)) {
    return { name: "navbar", level: 0, aliases: ["nav", "navigation", "menu"], description: "Primary navigation bar." };
  }
  if (t === "header") {
    return { name: "header", level: 0, aliases: ["top bar", "masthead"], description: "Page header." };
  }
  if (t === "footer") {
    return { name: "footer", level: 1, aliases: ["bottom", "site footer"], description: "Page footer." };
  }
  if (t === "aside") {
    return { name: "sidebar", level: 2, aliases: ["side nav", "left rail"], description: "Side panel." };
  }
  // First content block reads as the hero/banner.
  if (index === 0) {
    return { name: "hero", level: 1, aliases: ["banner", "featured", "splash"], description: "Lead/hero block." };
  }
  // Last block, when there are several, often the footer-ish CTA.
  if (index === count - 1 && count > 2) {
    return { name: "footer", level: 1, aliases: ["bottom"], description: "Closing block." };
  }
  return { name: `section-${index + 1}`, level: 2, aliases: [], description: "Content section." };
}

/** Name a page's raw sections, keeping names unique within the archetype. */
export function nameSections(
  archetypeKey: string,
  pageFile: string,
  raws: RawSection[],
): OnboardingSection[] {
  const used = new Map<string, number>();
  const slug = archetypeKey.replace(/[^\w]+/g, "-").replace(/(^-|-$)/g, "") || "home";

  return raws.map((raw, i) => {
    const p = proposeFor(raw.tagName, i, raws.length);
    let name = p.name;
    const seen = used.get(name) ?? 0;
    if (seen > 0) name = `${name}-${seen + 1}`;
    used.set(p.name, seen + 1);

    return {
      id: `${slug}:${raw.domIndex}`,
      name,
      level: p.level,
      aliases: p.aliases,
      tagName: raw.tagName,
      jsxPath: raw.jsxPath,
      domIndex: raw.domIndex,
      file: pageFile,
      line: raw.line,
      snippet: raw.snippet,
      colors: raw.colors,
      description: p.description,
    };
  });
}

/** An archetype's default level = the most permissive of its sections (cap 2). */
export function suggestArchetypeLevel(sections: OnboardingSection[]): number {
  const max = sections.reduce((m, s) => Math.max(m, s.level), 1);
  return Math.min(max, 2);
}
