# BB 0.45.0 host compatibility patch

`bb-0.45.0-action-drag.patch` restores the experimental host-owned Action
split-drag bridge used by Action Topbar. It targets only upstream BB commit
`129f621771a3e275773992db648316966ac207cf` (`desktop-v0.45.0`).

This is a local host repair, not a plugin bundle change. Reloading the plugin
alone cannot add the missing bridge. BB upgrades can replace this repair.
Do not apply this patch to another BB version without reconciling and testing
its host APIs.

The port preserves 0.45.0's lazy thread view, pane-content identity helper,
terminal creation mutation, and browser tab lifecycle. It also cancels an
active Action drag when its content-script generation is aborted.

## Reproduction

In a clean checkout of the exact upstream commit:

```sh
git apply --check /path/to/bb-0.45.0-action-drag.patch
git apply /path/to/bb-0.45.0-action-drag.patch
pnpm install --frozen-lockfile
pnpm exec turbo run typecheck build --filter=@bb/app --filter=@get-bb/plugin-sdk
```

Focused regression files are included in the patch. Run the app's drag,
split-layout, plugin frontend reload, Action pane, navigation, and terminal
mount tests, plus the SDK app harness tests before installation.

Back up `bb-app/app/dist` before installing `apps/app/dist`. Retain old hashed
assets during replacement so already-open clients can still load their lazy
chunks. Replace the HTML and compressed sidecars together. Reload the browser
after installation and verify a real Action drag before declaring UI success.
