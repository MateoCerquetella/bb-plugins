/**
 * Re-applies this plugin's compiled CSS scope to Radix content portaled under
 * document.body. The build replaces `__BB_PLUGIN_ID__` with the installed id.
 */
declare const __BB_PLUGIN_ID__: string | undefined;

export function usePortalScopeProps(): {
  "data-bb-portaled-overlay": "";
  "data-bb-plugin-root": "";
  "data-bb-plugin"?: string;
} {
  const pluginId =
    typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined;
  return {
    "data-bb-portaled-overlay": "",
    "data-bb-plugin-root": "",
    ...(pluginId === undefined ? {} : { "data-bb-plugin": pluginId }),
  };
}
