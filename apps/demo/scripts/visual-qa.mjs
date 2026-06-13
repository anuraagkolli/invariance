// Visual-QA gauntlet (the on-screen version of the hermetic compiler gauntlet):
// render faithful demo markup with the real styles.css, apply each compiled
// theme pack's role tokens to :root (exactly as the client overlay does),
// screenshot, and assert (1) every theme renders AA-contrast text, (2) the
// themes are visibly distinct on screen, (3) accents are mutually distinct.
//
//   pnpm --filter @invariance/demo run visual-qa
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");
const { compileTheme, THEME_PACKS, ROLE_TOKENS, oklchOf, contrastRatio } = require(
  join(repo, "packages/design/dist/server.js"),
);

const css = readFileSync(join(here, "..", "src", "styles.css"), "utf8");
const outDir = join(here, "..", "visual-qa-output");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const cards = (n) =>
  Array.from({ length: n })
    .map(
      (_, i) => `
    <div class="show-card">
      <div class="poster"><span class="poster-initials">S${i + 1}</span>
        <span class="card-badge">NEW</span>
        <button class="card-add">+</button>
        ${i % 2 ? '<div class="progress"></div>' : ""}
      </div>
      <div class="card-body"><div class="meta">Series ${i + 1}</div><span class="rating">★ 8.${i}</span></div>
    </div>`,
    )
    .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <div class="nav">
    <div class="brand">STREAMLINE</div>
    <a class="nav-link active">Home</a><a class="nav-link">Shows</a><a class="nav-link">My List</a>
    <div class="nav-extra"><span class="user-chip">A</span></div>
  </div>
  <div class="billboard">
    <div class="billboard-content">
      <h1 class="billboard-tagline">Orbital Decay</h1>
      <div class="billboard-meta"><span class="maturity">TV-MA</span><span class="rating">★ 8.9</span></div>
      <p class="billboard-synopsis">A derelict station drifts toward a dying star; its last crew must choose what to save.</p>
      <div class="billboard-actions"><button class="btn-play">▶ Play</button><button class="btn-list">+ My List</button></div>
    </div>
  </div>
  <div class="rows">
    <div class="row"><div class="row-heading">Trending Now</div><div class="row-scroller">${cards(6)}</div></div>
    <div class="row"><div class="row-heading">Continue Watching</div><div class="row-scroller">${cards(6)}</div></div>
  </div>
  <div class="footer">Streamline — a demo of compiler-driven theming</div>
</body></html>`;

const dE = (a, b) => {
  const lab = (o) => [o.l, o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)];
  const [aL, aA, aB] = lab(a);
  const [bL, bA, bB] = lab(b);
  return Math.hypot(aL - bL, aA - bA, aB - bB);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.setContent(html, { waitUntil: "load" });

const results = [];
for (const pack of THEME_PACKS) {
  const { roles } = compileTheme(pack.spec);
  await page.evaluate((r) => {
    for (const [token, value] of Object.entries(r)) document.documentElement.style.setProperty(token, value);
  }, roles);
  const rendered = await page.evaluate(() => {
    const g = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).getPropertyValue(prop) : "";
    };
    return { bodyBg: g("body", "background-color"), cardBg: g(".show-card", "background-color"), playBg: g(".btn-play", "background-color") };
  });
  await page.screenshot({ path: join(outDir, `${pack.id}.png`), fullPage: false });

  const contrast = contrastRatio(roles["--inv-text-primary"], roles["--inv-surface-0"]);
  results.push({
    id: pack.id,
    contrast,
    accent: oklchOf(roles["--inv-accent"]),
    signature: `${rendered.bodyBg}|${rendered.cardBg}|${rendered.playBg}`,
    playBg: rendered.playBg,
  });
}
await browser.close();

// --- assertions ---
const failures = [];
for (const r of results) {
  if (r.contrast < 4.5) failures.push(`${r.id}: text/surface contrast ${r.contrast.toFixed(2)} < 4.5`);
  if (!r.playBg || /rgba?\(0, 0, 0, 0\)/.test(r.playBg)) failures.push(`${r.id}: play button did not pick up the accent (bg ${r.playBg})`);
}
const distinctSignatures = new Set(results.map((r) => r.signature)).size;
if (distinctSignatures < Math.ceil(results.length * 0.8)) {
  failures.push(`themes not visibly distinct on screen: only ${distinctSignatures}/${results.length} unique renders`);
}
let closest = { pair: "", d: Infinity };
for (let i = 0; i < results.length; i++)
  for (let j = i + 1; j < results.length; j++) {
    const d = dE(results[i].accent, results[j].accent);
    if (d < closest.d) closest = { pair: `${results[i].id}/${results[j].id}`, d };
  }
if (closest.d < 0.03) failures.push(`accents too close: ${closest.pair} (ΔE ${closest.d.toFixed(3)})`);

console.log("\n  pack                 contrast  applied?");
for (const r of results) {
  console.log(`  ${r.id.padEnd(20)} ${r.contrast.toFixed(2).padStart(6)}   ${r.playBg}`);
}
console.log(`\n  ${results.length} packs · ${distinctSignatures} distinct on-screen renders · closest accent ΔE ${closest.d.toFixed(3)}`);
console.log(`  screenshots -> ${outDir}`);

if (failures.length) {
  console.error("\nVISUAL-QA FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("\nVISUAL-QA PASS: every theme renders AA-contrast, visibly distinct, with a distinct accent.\n");
