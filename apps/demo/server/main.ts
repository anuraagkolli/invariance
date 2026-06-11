import { createDemoServer } from "./app";

const port = Number(process.env.PORT ?? 4500);
createDemoServer().listen(port, () => {
  console.log(`streamline demo api listening on :${port}`);
});
