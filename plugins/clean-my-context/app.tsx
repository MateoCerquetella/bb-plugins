import { useRef, useState } from "react";
import {
  definePluginApp,
  useBbContext,
  useComposer,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server.js";
import { Button } from "./components/ui/button.js";
import { Icon } from "./components/ui/icon.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ClearContextAction() {
  const { threadId } = useBbContext();
  const composer = useComposer();
  const rpc = useRpc<typeof rpcContract>();
  const clearingRef = useRef(false);
  const [clearing, setClearing] = useState(false);

  async function clearCurrentThread(): Promise<void> {
    if (clearingRef.current || threadId === null) {
      return;
    }
    if (
      !window.confirm(
        "Clear this thread's visible chat and model context? Its branch, folder, workspace, and settings will stay the same.",
      )
    ) {
      return;
    }
    clearingRef.current = true;
    setClearing(true);
    try {
      await rpc.call("clearContext", { threadId });
      toast.success("Thread context cleared", {
        description:
          "Continue here with the same branch, folder, workspace, and settings.",
      });
      composer.focus();
    } catch (error) {
      toast.error("Could not clear this thread", {
        description: errorMessage(error),
      });
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 bg-transparent text-foreground hover:bg-state-hover"
      aria-label="Clear this thread"
      disabled={clearing || threadId === null}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void clearCurrentThread()}
    >
      <Icon
        name={clearing ? "Spinner" : "Clean"}
        className={clearing ? "animate-spin" : undefined}
      />
    </Button>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "clear-context",
    scopes: ["thread"],
    actions: [{ id: "clear-thread", component: ClearContextAction }],
  });
});
