/** The panel's URL shape: factories → factory board → agent → ticket. */

export const PANEL_PATH = "factory-bots";

export type FactoryView =
  | { view: "board" }
  | { view: "souls" }
  | { view: "capabilities" }
  | { view: "agent"; agent: string }
  | { view: "ticket"; agent: string; linearId: string };

export type PanelRoute = { view: "factories" } | ({ factoryId: string } & FactoryView);

export function parsePanelRoute(subPath: string): PanelRoute {
  const [factoryId, ...parts] = subPath
    .split("/")
    .filter((part) => part !== "")
    .map((part) => safeDecode(part));
  if (factoryId === undefined) return { view: "factories" };
  return { factoryId, ...parseFactoryView(parts) };
}

function parseFactoryView(parts: string[]): FactoryView {
  if (parts[0] === "souls") return { view: "souls" };
  if (parts[0] === "capabilities") return { view: "capabilities" };

  if (parts[0] === "agent" && parts.length >= 2 && parts[1] !== "") {
    if (parts[2] === "ticket" && parts[3] !== undefined && parts[3] !== "") {
      return { view: "ticket", agent: parts[1]!, linearId: parts[3] };
    }
    return { view: "agent", agent: parts[1]! };
  }
  return { view: "board" };
}

export function boardRoute(factoryId: string): string {
  return encodeURIComponent(factoryId);
}

export function soulsRoute(factoryId: string): string {
  return `${boardRoute(factoryId)}/souls`;
}

export function capabilitiesRoute(factoryId: string): string {
  return `${boardRoute(factoryId)}/capabilities`;
}

export function agentRoute(factoryId: string, agent: string): string {
  return `${boardRoute(factoryId)}/agent/${encodeURIComponent(agent)}`;
}

export function ticketRoute(factoryId: string, agent: string, linearId: string): string {
  return `${agentRoute(factoryId, agent)}/ticket/${encodeURIComponent(linearId)}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
