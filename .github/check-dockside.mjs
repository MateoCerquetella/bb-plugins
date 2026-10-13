import { spawnSync } from "node:child_process";

function run(args) {
  const env = { ...process.env };
  delete env.BB_CLI;
  const result = spawnSync("npm", args, { env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed with ${result.status}`);
  }
}

run(["run", "typecheck", "--workspace", "bb-plugin-dockside"]);
run(["test", "--workspace", "bb-plugin-dockside"]);
run(["run", "build", "--workspace", "bb-plugin-dockside"]);
