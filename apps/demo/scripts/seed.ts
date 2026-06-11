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

  const draft = {
    uiOps: [
      { type: "token-override", token: "--inv-accent", value: "#ff4d8d" },
      {
        type: "style-rule",
        selector: ".show-card",
        declarations: { border: "1px solid #ff4d8d" },
      },
      {
        type: "slot-override",
        componentId: "show-card",
        slot: "badge",
        content: '<span class="badge">★ Hand-picked</span>',
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
