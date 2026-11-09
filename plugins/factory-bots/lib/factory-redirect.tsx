import { useEffect, useState } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";

import type { rpcContract } from "../contract";
import { PANEL_PATH, boardRoute } from "./route";

/** The bare panel opens the first factory until a factories screen exists. */
export function FactoryRedirect() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    rpc
      .call("listFactories", null)
      .then(({ factories }) => {
        const first = factories[0];
        if (live && first !== undefined) {
          navigate.toPluginPanel(PANEL_PATH, { subPath: boardRoute(first.id) });
        }
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      live = false;
    };
  }, [rpc, navigate]);

  return error === null ? null : <p role="alert">Could not read factories: {error}</p>;
}
