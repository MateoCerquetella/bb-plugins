import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const [projectId, apiPort, cdpPort, viewerOrigin] = process.argv.slice(2);
if (!projectId || !/^[a-zA-Z0-9_-]{1,200}$/.test(projectId)
  || ![apiPort, cdpPort].every(p => /^\d+$/.test(p ?? "") && +p >= 1024 && +p <= 65535)
  || apiPort === cdpPort) throw new Error("Usage: node provision-project.mjs PROJECT_ID API_PORT CDP_PORT HTTPS_VIEWER_ORIGIN");
const viewer = new URL(viewerOrigin);
if (viewer.protocol !== "https:" || viewer.username || viewer.password || viewer.pathname !== "/" || viewer.search || viewer.hash) {
  throw new Error("Use the exact authenticated BB Connect HTTPS origin.");
}
const id = createHash("sha256").update(projectId).digest("hex").slice(0, 24);
const name = `bb-steel-${id}`;
const image = "ghcr.io/steel-dev/steel-browser@sha256:f5cd68fbc2cb27e5d7766269860fd0fb29cbe5fe506245a49c82f85ba210e7da";
const docker = args => execFileSync("docker", args, { encoding: "utf8", timeout: 120000 });
const existing = docker(["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]).trim();
if (existing) {
  throw new Error(`Project container ${name} already exists. Inspect it instead of replacing its profile.`);
}
docker(["run", "-d", "--init", "--restart", "unless-stopped", "--shm-size", "1g",
  "--name", name, "--label", `bb.steel.project=${projectId}`,
  "-p", `127.0.0.1:${apiPort}:3000`, "-p", `127.0.0.1:${cdpPort}:9223`,
  "-e", `DOMAIN=${viewer.host}`, "-e", "USE_SSL=true",
  "-e", "CHROME_USER_DATA_DIR=/profiles/chrome",
  "-v", `${name}-profile:/profiles`,
  image]);
console.log(JSON.stringify({ projectId, container: name, profileVolume: `${name}-profile`,
  apiUrl: `http://127.0.0.1:${apiPort}`, cdpUrl: `http://127.0.0.1:${cdpPort}`, viewerUrl: viewer.origin }, null, 2));
