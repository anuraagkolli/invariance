import manifest from "../invariance.manifest.json";

const registry = process.env.INVARIANCE_REGISTRY ?? "http://localhost:4400";
const subject = process.env.DEMO_USER ?? "demo-user";

async function main() {
  const manifestRes = await fetch(`${registry}/v1/apps/streamline/manifest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  console.log("manifest publish:", manifestRes.status, await manifestRes.json());

  // A hand-written modset for the default demo user, so the app loads visibly
  // customized: cooler palette, rounder cards, a badge, and a personal tagline.
  const draft = {
    uiOps: [
      { type: "token-override", token: "--inv-accent", value: "#00b3a4" },
      { type: "token-override", token: "--inv-accent-2", value: "#ffb43a" },
      { type: "token-override", token: "--inv-radius", value: "14px" },
      {
        type: "style-rule",
        selector: ".show-card",
        declarations: { border: "1px solid #00b3a466" },
      },
      {
        type: "slot-override",
        componentId: "show-card",
        slot: "badge",
        content: '<span class="badge">★ Hand-picked</span>',
      },
      {
        type: "slot-override",
        componentId: "billboard",
        slot: "tagline",
        content: "<span>Tonight's obsession, picked for you</span>",
      },
      {
        type: "slot-override",
        componentId: "footer",
        slot: "message",
        content: "<span>Customized by demo-user via Invariance ✨</span>",
      },
    ],
  };
  const bundleRes = await fetch(
    `${registry}/v1/apps/streamline/subjects/${subject}/bundles`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    },
  );
  console.log("seed bundle publish:", bundleRes.status, await bundleRes.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
