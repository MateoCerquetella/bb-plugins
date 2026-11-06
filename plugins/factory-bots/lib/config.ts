import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The plugin-owned MCP connection, exactly as the factory documents it. */
export interface FactoryMcpConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Set by the loader when a relative script path needs the config's dir. */
  cwd?: string;
}

export interface LoadedFactoryMcpConfig {
  config: FactoryMcpConfig | null;
  path: string | null;
  error: string | null;
}

const CONFIG_FILENAME = "factory.mcp.json";
export const DEFAULT_FACTORY_URL = "http://127.0.0.1:8080";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the three fields the factory MCP command needs. */
export function parseMcpConfig(value: unknown): FactoryMcpConfig {
  if (!isRecord(value)) {
    throw new Error(`${CONFIG_FILENAME} must contain a JSON object.`);
  }
  const command = value.command;
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error(`${CONFIG_FILENAME} needs a non-empty "command" string.`);
  }
  const args = value.args;
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error(`${CONFIG_FILENAME} needs "args" as an array of strings.`);
  }
  const rawEnv = value.env ?? {};
  if (!isRecord(rawEnv)) {
    throw new Error(`${CONFIG_FILENAME} "env" must be an object of strings.`);
  }
  const env: Record<string, string> = {};
  for (const [key, envValue] of Object.entries(rawEnv)) {
    if (typeof envValue !== "string") {
      throw new Error(`${CONFIG_FILENAME} env.${key} must be a string.`);
    }
    env[key] = envValue;
  }
  return { command, args: [...args], env };
}

/** POSIX-safe display form for the start command. */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Derive the start command from the same config the MCP client uses. The
 * non-default FACTORY_URL is preserved; the VAR=value prefix is POSIX syntax.
 */
export function startCommand(config: FactoryMcpConfig): string {
  const args = [...config.args];
  if (args.at(-1) === "mcp") args[args.length - 1] = "up";
  else args.push("up");
  const command = [config.command, ...args].map(shellQuote).join(" ");
  const url = config.env.FACTORY_URL;
  return url !== undefined && url !== DEFAULT_FACTORY_URL
    ? `FACTORY_URL=${shellQuote(redactUrl(url))} ${command}`
    : command;
}

/** Keep the origin but never print credentials embedded in a URL. */
function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") {
      url.username = "";
      url.password = "";
      return url.toString().replace(/\/$/, "");
    }
    return value;
  } catch {
    return value;
  }
}

export interface LoadConfigOptions {
  /** `import.meta.url` of the caller; the config sits beside or above it. */
  moduleUrl: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  factoryCheckoutPath?: string;
  readFile?: (path: string) => Promise<string>;
  exists?: (path: string) => Promise<boolean>;
}

/**
 * Load the MCP config. Source installs keep it beside `server.ts`; built
 * installs keep it one level above `dist/server.js`. `FACTORY_BOTS_MCP_CONFIG`
 * points at another file when the factory checkout moves.
 */
export async function loadMcpConfig(
  options: LoadConfigOptions,
): Promise<LoadedFactoryMcpConfig> {
  const read = options.readFile ?? ((path: string) => readFile(path, "utf8"));
  const exists =
    options.exists ??
    (async (path: string) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    });
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const override = env.FACTORY_BOTS_MCP_CONFIG;
  const candidates: string[] = [];

  if (override !== undefined && override.trim() !== "") {
    candidates.push(resolve(cwd, override.trim()));
  } else {
    const moduleDir = fileURLToPath(new URL(".", options.moduleUrl));
    candidates.push(resolve(moduleDir, CONFIG_FILENAME));
    candidates.push(resolve(moduleDir, "..", CONFIG_FILENAME));
  }

  for (const path of candidates) {
    let text: string;
    try {
      text = await read(path);
    } catch {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      const config = parseMcpConfig(parsed);
      if (options.factoryCheckoutPath?.trim()) {
        applyFactoryCheckoutPath(config, options.factoryCheckoutPath);
      }
      const baseDir = dirname(path);
      const scripts = scriptPaths(config);
      if (scripts.some((script) => !isAbsolute(script))) {
        config.cwd = baseDir;
      }
      for (const candidate of scripts) {
        const script = resolve(baseDir, candidate);
        if (!(await exists(script))) {
          return {
            config: null,
            path,
            error: `Factory MCP script not found at ${script}. Edit ${path} or set FACTORY_BOTS_MCP_CONFIG to a config for this host, then reload the Factory Bots plugin.`,
          };
        }
      }
      return { config, path, error: null };
    } catch (cause) {
      return {
        config: null,
        path,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  return {
    config: null,
    path: null,
    error: `No ${CONFIG_FILENAME} found next to the plugin. Looked in ${candidates.join(", ")}.`,
  };
}

export function factoryEntryPoint(config: FactoryMcpConfig): string | null {
  const value = config.args.find((arg) => !arg.startsWith("-") && /\.(?:m?js|cjs)$/.test(arg));
  return value === undefined ? null : value;
}

function applyFactoryCheckoutPath(config: FactoryMcpConfig, checkoutPath: string): void {
  const normalized = checkoutPath.trim();
  if (!isAbsolute(normalized)) {
    throw new Error("Factory checkout path must be an absolute directory path.");
  }
  const entryPoint = factoryEntryPoint(config);
  if (entryPoint === null) {
    throw new Error(`No JavaScript Factory entry point is configured in ${CONFIG_FILENAME}.`);
  }
  const index = config.args.indexOf(entryPoint);
  config.args[index] = resolve(normalized, "dist", "main.js");
}

function scriptPaths(config: FactoryMcpConfig): string[] {
  const paths: string[] = [];
  for (const value of [config.command, ...config.args]) {
    if (value.startsWith("-")) continue;
    if (/[\\/]/.test(value) || /\.(?:m?js|cjs)$/.test(value)) {
      paths.push(value);
    }
  }
  return paths;
}
