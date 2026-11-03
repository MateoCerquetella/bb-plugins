/** The panel's URL shape: board → agent → ticket. */

export type PanelRoute =
  | { view: "board" }
  | { view: "souls" }
  | { view: "agent"; agent: string }
  | { view: "ticket"; agent: string; linearId: string };

export function parsePanelRoute(subPath: string): PanelRoute {
  const parts = subPath
    .split("/")
    .filter((part) => part !== "")
    .map((part) => safeDecode(part));

  if (parts[0] === "souls") return { view: "souls" };

  if (parts[0] === "agent" && parts.length >= 2 && parts[1] !== "") {
    if (parts[2] === "ticket" && parts[3] !== undefined && parts[3] !== "") {
      return { view: "ticket", agent: parts[1]!, linearId: parts[3] };
    }
    return { view: "agent", agent: parts[1]! };
  }
  return { view: "board" };
}

export function agentRoute(agent: string): string {
  return `agent/${encodeURIComponent(agent)}`;
}

export function ticketRoute(agent: string, linearId: string): string {
  return `${agentRoute(agent)}/ticket/${encodeURIComponent(linearId)}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
