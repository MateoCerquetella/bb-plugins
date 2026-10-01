import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Binding } from "./contract.ts";

const exec = promisify(execFile);
export async function verifyProjectInstance(projectId: string, binding: Binding): Promise<void> {
  const hash = createHash("sha256").update(projectId).digest("hex").slice(0, 24);
  const name = `bb-steel-${hash}`;
  try {
    const { stdout } = await exec("docker", ["inspect", name], { timeout: 8000, maxBuffer: 65536 });
    const [instance] = JSON.parse(stdout);
    const ports = instance.NetworkSettings.Ports;
    const apiPort = new URL(binding.apiUrl).port;
    const cdpPort = new URL(binding.cdpUrl).port;
    const matchesPort = (key: string, port: string) => ports[key]?.length === 1
      && ports[key][0].HostIp === "127.0.0.1" && ports[key][0].HostPort === port;
    if (instance.Config.Labels["bb.steel.project"] !== projectId
      || !instance.State.Running
      || !matchesPort("3000/tcp", apiPort) || !matchesPort("9223/tcp", cdpPort)
      || !instance.Config.Env.includes("CHROME_USER_DATA_DIR=/profiles/chrome")
      || !instance.Config.Env.includes(`DOMAIN=${new URL(binding.viewerUrl).host}`)
      || !instance.Mounts.some((mount: { Type: string; Name: string; Destination: string }) =>
        mount.Type === "volume" && mount.Name === `${name}-profile` && mount.Destination === "/profiles")) {
      throw new Error("Mismatch");
    }
  } catch {
    throw new Error("Binding refused: no matching running project container with dedicated profile and loopback ports.");
  }
}
