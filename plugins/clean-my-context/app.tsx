import { useState } from "react";
import {
  definePluginApp,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server.js";
import { Button } from "./components/ui/button.js";
import { Icon } from "./components/ui/icon.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ClearContextAction({ threadId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [clearing, setClearing] = useState(false);

  async function clearContext(): Promise<void> {
    if (
      !window.confirm(
        "Clear this thread's model context? Its BB history and workspace will stay unchanged.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await rpc.call("clearContext", { threadId });
      toast.success("Model context cleared", {
        description:
          "New prompts start fresh; thread history and workspace are unchanged.",
      });
    } catch (error) {
      toast.error("Could not clear model context", {
        description: errorMessage(error),
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label="Clear model context"
      disabled={clearing}
      onClick={() => void clearContext()}
    >
      <Icon
        name={clearing ? "Spinner" : "Clean"}
        className={clearing ? "animate-spin" : undefined}
      />
    </Button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "clear-context",
    title: "Clean My Context",
    component: ClearContextAction,
  });
});
