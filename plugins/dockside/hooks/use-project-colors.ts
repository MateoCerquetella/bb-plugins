import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { docksideRpcContract } from "@/server";
import { useRetryingRead } from "@/hooks/use-retrying-read";

export interface ProjectColorsApi {
  overrides: ReadonlyMap<string, string>;
  isLoading: boolean;
  reload(): void;
  setProjectColor(projectId: string, color: string): Promise<string>;
  resetProjectColor(projectId: string): Promise<void>;
}

export function useProjectColors(): ProjectColorsApi {
  const rpc = useRpc<typeof docksideRpcContract>();
  const [overrides, setOverrides] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const requestSequence = useRef(0);

  const read = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const result = await rpc.call("listProjectColors", {});
    if (sequence !== requestSequence.current) return;
    setOverrides(
      new Map(result.colors.map(({ projectId, color }) => [projectId, color])),
    );
    setIsLoading(false);
  }, [rpc]);
  const refresh = useRetryingRead(read);

  useEffect(() => refresh(), [refresh]);
  useRealtime("project-colors", () => refresh());

  const connectionState = useRealtimeConnectionState();
  const previousConnectionState = useRef(connectionState);
  useEffect(() => {
    const previous = previousConnectionState.current;
    previousConnectionState.current = connectionState;
    if (previous === "reconnecting" && connectionState === "connected") {
      refresh();
    }
  }, [connectionState, refresh]);

  const setProjectColor = useCallback(
    async (projectId: string, color: string) => {
      const stored = await rpc.call("setProjectColor", { projectId, color });
      setOverrides((current) => {
        const next = new Map(current);
        next.set(stored.projectId, stored.color);
        return next;
      });
      return stored.color;
    },
    [rpc],
  );

  const resetProjectColor = useCallback(
    async (projectId: string) => {
      await rpc.call("resetProjectColor", { projectId });
      setOverrides((current) => {
        if (!current.has(projectId)) return current;
        const next = new Map(current);
        next.delete(projectId);
        return next;
      });
    },
    [rpc],
  );

  return useMemo(
    () => ({
      overrides,
      isLoading,
      reload: refresh,
      resetProjectColor,
      setProjectColor,
    }),
    [isLoading, overrides, refresh, resetProjectColor, setProjectColor],
  );
}
