import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const state = join(homedir(), ".codex", "codex-router");
const path = join(state, "user-models.json");
const model = JSON.parse(await readFile(new URL("./jev-model.json", import.meta.url), "utf8"));
await mkdir(state, { recursive: true });
let catalog;
try { catalog = JSON.parse(await readFile(path, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; catalog = { version: 1, models: [] }; }
if (!Array.isArray(catalog.models)) throw new Error("Invalid user model catalog");
catalog.models = [...catalog.models.filter(item => item.slug !== model.slug), model];
await writeFile(`${path}.jev.tmp`, JSON.stringify(catalog, null, 2) + "\n", { mode: 0o600 });
await rename(`${path}.jev.tmp`, path);
console.log("Registered Jev Routing; existing model entries preserved.");
