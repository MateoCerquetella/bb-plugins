import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ActivityOverview } from "./component";
import "./app.css";

export default definePluginApp(app => {
  app.slots.homepageSection({ id: "activity-overview", title: "Activity Overview", component: ActivityOverview });
  app.slots.settingsSection({ id: "activity-overview", title: "Activity Overview", component: ActivityOverview });
  app.slots.threadPanelAction({ id: "activity-overview", title: "Activity Overview", icon: "Activity", component: ActivityOverview, layout: "flush" });
});
