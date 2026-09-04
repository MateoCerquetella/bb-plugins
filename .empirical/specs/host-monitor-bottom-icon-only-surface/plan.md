# Plan

1. Confirm the carried frontend registers one Activity `sidebarFooterAction`
   using `openSettings()`, one dashboard `settingsSection`, and no nav panel,
   sidebar accessory/replacement, content script, app overlay, popup, or
   floating surface.
2. Confirm the carried dashboard retains all enrolled hosts, current cards,
   reference-aligned historical charts, system facts, per-host configurable
   panels, inline errors, and responsive host-token styling.
3. Run Host Monitor typecheck, all 29 focused tests, production build, and
   public-SDK/source absence checks; repair only scoped failures.
4. Install/reload the final worktree path and check the Host Monitor sampler is
   running against BB's existing host/realtime infrastructure.
5. Run the repeatable Chromium flow from BB's main app: verify one bottom icon
   and zero Host Monitor page rows, activate the icon, inspect four hosts,
   Edit/Add/Cancel, switch hosts, and repeat editing at 390px without overflow.
6. Round-trip one host configuration through a live reload, prove a second host
   is unchanged, and restore the original configuration.
7. Record test/browser/screenshot/fresh-context evidence, run workspace checks,
   review the final diff, and stop at verified/ready-for-review without merge,
   deploy, publish, tag, or push.
