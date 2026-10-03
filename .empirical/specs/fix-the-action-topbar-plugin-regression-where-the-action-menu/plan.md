# Implementation Plan

1. Create a clean BB checkout at commit
   `129f621771a3e275773992db648316966ac207cf`; capture toolchain and installed
   asset manifests.
2. Apply `/tmp/action-drag-0.44.patch` in the clean checkout and classify
   conflicts. Reconcile route, split-layout, plugin frontend, Action-pane, and
   terminal changes against 0.45.0 APIs; reject unrelated historical changes.
3. Add focused regression tests for the Action callback, drag lifecycle,
   unsupported-host guard, pane navigation, and cleanup.
4. Run focused tests, SDK/app typechecks, plugin checks, and an isolated
   production build. Record immutable receipts for each configured command.
5. Back up the installed frontend, install the verified build, reload the
   plugin, and perform live Steel-browser drag/release/cancel verification with
   a screenshot.
6. If any gate fails, restore the backup and report the exact failing stage;
   otherwise record the installed build identity and complete the feature.
