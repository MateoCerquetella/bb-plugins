import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { docksideRpcContract } from "@/server";
import type { FactoryAgent } from "@/lib/factory-bots";

export interface FactoryBotsState {
  status: "idle" | "loading" | "ready" | "error";
  agents: FactoryAgent[];
  message: string | null;
}

const IDLE: FactoryBotsState = { status: "idle", agents: [], message: null };
const REFRESH_MS = 5_000;

/**
 * The Factory Bots board, polled only while the sidebar section is enabled.
 * The factory itself is read by the Factory Bots plugin through its MCP; this
 * only asks that plugin for the same read the board uses.
 */
export function useFactoryBots(enabled: boolean): FactoryBotsState {
  const rpc = useRpc<typeof docksideRpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [state, setState] = useState<FactoryBotsState>(IDLE);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }

    setState((current) =>
      current.status === "idle"
        ? { status: "loading", agents: [], message: null }
        : current,
    );

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    const run = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const result = await rpcRef.current.call("factoryBots", {});
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", agents: result.agents, message: null }
            : {
                status: "error",
                agents: [],
                message: result.message ?? "Factory Bots is unavailable.",
              },
        );
      } catch (cause) {
        if (!cancelled) {
          setState({
            status: "error",
            agents: [],
            message:
              cause instanceof Error
                ? cause.message
                : "Factory Bots is unavailable.",
          });
        }
      } finally {
        inFlight = false;
        if (!cancelled) timer = setTimeout(() => void run(), REFRESH_MS);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled]);

  return state;
}
