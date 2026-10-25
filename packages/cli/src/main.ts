import { run } from "./cli";

const code = await run(process.argv.slice(2));
if (code >= 0) process.exit(code);
