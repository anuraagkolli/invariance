import { createInvarianceMiddleware } from "@invariance/server";
import { createDemoServer } from "./app";

const port = Number(process.env.PORT ?? 4500);
const registryUrl = process.env.INVARIANCE_REGISTRY ?? "http://localhost:4400";

const middleware = createInvarianceMiddleware({
  registryUrl,
  appId: "streamline",
  // The demo identifies its user with x-demo-user.
  getSubject: (req) => req.header("x-demo-user") ?? undefined,
});

createDemoServer({ middleware }).listen(port, () => {
  console.log(`streamline demo api listening on :${port} (registry ${registryUrl})`);
});
