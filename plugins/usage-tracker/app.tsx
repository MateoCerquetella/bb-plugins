import { definePluginApp } from "@bb/plugin-sdk/app";
import { mountSidebarUsageStrip } from "@/lib/sidebar-strip";
import "./app.css";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "sidebar-usage-strip",
    mount: ({ signal }) => mountSidebarUsageStrip(signal),
  });
});
