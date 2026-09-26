import { readFile, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const path = join(homedir(), ".bb", "config.json");
const config = JSON.parse(await readFile(path, "utf8"));
const models = config.customModels ?? [];
if (!Array.isArray(models)) throw new Error("Invalid BB customModels configuration");
config.customModels = [
  ...models.filter(model => !(model.providerId === "codex" && model.model === "jev/auto")),
  { providerId: "codex", model: "jev/auto", displayName: "Jev Routing" },
];
await writeFile(`${path}.jev.tmp`, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
await rename(`${path}.jev.tmp`, path);
console.log("Added Jev Routing to BB's Codex model picker.");
