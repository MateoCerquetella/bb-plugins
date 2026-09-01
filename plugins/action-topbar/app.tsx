import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountActionTopbar } from "./lib/action-topbar.js";
import "./app.css";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "action-topbar",
    mount: (context) => {
      const splitContext = context as typeof context & {
        experimental_beginThreadActionSplitDrag?: (
          request: {
            actionId: string;
            threadId: string;
            source: HTMLElement;
            startX: number;
            startY: number;
          },
        ) => boolean;
      };
      return mountActionTopbar(
        context.signal,
        splitContext.experimental_beginThreadActionSplitDrag,
      );
    },
  });
});
