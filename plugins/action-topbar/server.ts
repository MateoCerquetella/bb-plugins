import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  MAX_TAB_ID_LENGTH,
  MAX_TAB_LABEL_LENGTH,
  TAB_KINDS,
  boundedTabLabel,
  type TabKind,
  type TabSummary,
} from "./lib/tab-model.ts";

type ThreadTabsResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["tabs"]["get"]>
>;
type ThreadTab = ThreadTabsResult["tabs"][number];
const MAX_TABS = 200;

const tabSummarySchema = z
  .object({
    id: z.string().min(1).max(MAX_TAB_ID_LENGTH),
    kind: z.enum(TAB_KINDS),
    label: z.string().min(1).max(MAX_TAB_LABEL_LENGTH),
    closable: z.boolean(),
    relaunchActionId: z.string().min(1).max(MAX_TAB_ID_LENGTH).nullable(),
  })
  .strict();

const tabsSnapshotSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    tabs: z.array(tabSummarySchema).max(MAX_TABS),
  })
  .strict();

const threadIdInputSchema = z.object({ threadId: z.string().min(1) }).strict();
const reorderTabsInputSchema = z
  .object({
    activeTabId: z.string().min(1),
    overTabId: z.string().min(1),
    threadId: z.string().min(1),
  })
  .strict();
const closeTabInputSchema = z
  .object({
    tabId: z.string().min(1),
    terminalId: z.string().min(1).optional(),
    threadId: z.string().min(1),
  })
  .strict();

export const actionTopbarRpcContract = defineRpcContract({
  closeTab: {
    input: closeTabInputSchema,
    output: tabsSnapshotSchema,
  },
  listTabs: {
    input: threadIdInputSchema,
    output: tabsSnapshotSchema,
  },
  reorderTabs: {
    input: reorderTabsInputSchema,
    output: tabsSnapshotSchema,
  },
});

function basename(path: string): string {
  const withoutTrailingSlash = path.replace(/\/+$/, "");
  return withoutTrailingSlash.split("/").at(-1) || path;
}

function browserLabel(url: string, title: string | null): string {
  if (title?.trim()) return boundedTabLabel(title, "Browser");
  if (!url) return "Browser";
  try {
    return boundedTabLabel(new URL(url).hostname, "Browser");
  } catch {
    return "Browser";
  }
}

function summarizeTab(tab: ThreadTab): TabSummary {
  const kind = tab.kind as TabKind;
  switch (tab.kind) {
    case "thread-info":
      return {
        id: tab.id,
        kind,
        label: "Info",
        closable: false,
        relaunchActionId: null,
      };
    case "git-diff":
      return {
        id: tab.id,
        kind,
        label: "Diff",
        closable: false,
        relaunchActionId: null,
      };
    case "plugin-panel":
      return {
        id: tab.id,
        kind,
        label: boundedTabLabel(tab.title, "Panel"),
        closable: true,
        relaunchActionId: `plugin-action:${tab.pluginId}:${tab.actionId}`,
      };
    case "workspace-file-preview":
    case "host-file-preview":
    case "thread-storage-file-preview":
      return {
        id: tab.id,
        kind,
        label: boundedTabLabel(basename(tab.path), "File"),
        closable: tab.kind !== "thread-storage-file-preview" || !tab.isPinned,
        relaunchActionId: null,
      };
    case "browser":
      return {
        id: tab.id,
        kind,
        label: browserLabel(tab.url, tab.title),
        closable: true,
        relaunchActionId: "file-search-result-open-browser",
      };
    case "new-tab":
      return {
        id: tab.id,
        kind,
        label: "New tab",
        closable: true,
        relaunchActionId: null,
      };
    case "side-chat":
      return {
        id: tab.id,
        kind,
        label: boundedTabLabel(tab.title, "Side chat"),
        closable: true,
        relaunchActionId: "plugin-action:side-chat:side-chat",
      };
    case "terminal":
      return {
        id: tab.id,
        kind,
        label: "Terminal",
        closable: true,
        relaunchActionId: "file-search-result-start-terminal",
      };
  }
}

function summarizeTabs(result: ThreadTabsResult) {
  return {
    revision: result.revision,
    tabs: result.tabs.map(summarizeTab),
  };
}

export default function plugin(bb: BbPluginApi): void {
  bb.rpc.register(actionTopbarRpcContract, {
    async closeTab({ tabId, terminalId, threadId }) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = await bb.sdk.threads.tabs.get({ threadId });
        const target = current.tabs.find((tab) => tab.id === tabId);
        const terminalToClose =
          terminalId ??
          (target?.kind === "terminal" ? target.terminalId : undefined);
        if (terminalToClose !== undefined) {
          try {
            await bb.sdk.terminals.close({
              mode: "force",
              terminalId: terminalToClose,
            });
          } catch {
            bb.log.warn(`Terminal ${terminalToClose} was already unavailable`);
          }
          const closed = await bb.sdk.threads.tabs.get({ threadId });
          if (!closed.tabs.some((tab) => tab.id === tabId)) {
            return summarizeTabs(closed);
          }
          return summarizeTabs(
            await bb.sdk.threads.tabs.update({
              expectedRevision: closed.revision,
              tabs: closed.tabs.filter((tab) => tab.id !== tabId),
              threadId,
            }),
          );
        }
        if (target === undefined) {
          return summarizeTabs(current);
        }
        try {
          return summarizeTabs(
            await bb.sdk.threads.tabs.update({
              expectedRevision: current.revision,
              tabs: current.tabs.filter((tab) => tab.id !== tabId),
              threadId,
            }),
          );
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }

      return summarizeTabs(await bb.sdk.threads.tabs.get({ threadId }));
    },
    async listTabs({ threadId }) {
      return summarizeTabs(await bb.sdk.threads.tabs.get({ threadId }));
    },
    async reorderTabs({ activeTabId, overTabId, threadId }) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const current = await bb.sdk.threads.tabs.get({ threadId });
        const activeIndex = current.tabs.findIndex(
          (tab) => tab.id === activeTabId,
        );
        const overIndex = current.tabs.findIndex((tab) => tab.id === overTabId);
        if (
          activeIndex === -1 ||
          overIndex === -1 ||
          activeIndex === overIndex
        ) {
          return summarizeTabs(current);
        }

        const tabs = [...current.tabs];
        const [activeTab] = tabs.splice(activeIndex, 1);
        if (activeTab === undefined) return summarizeTabs(current);
        tabs.splice(overIndex, 0, activeTab);
        try {
          return summarizeTabs(
            await bb.sdk.threads.tabs.update({
              expectedRevision: current.revision,
              tabs,
              threadId,
            }),
          );
        } catch (error) {
          if (attempt === 1) throw error;
        }
      }

      return summarizeTabs(await bb.sdk.threads.tabs.get({ threadId }));
    },
  });
}
