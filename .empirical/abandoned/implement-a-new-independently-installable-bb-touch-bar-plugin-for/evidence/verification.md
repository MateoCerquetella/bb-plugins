# Touch Bar plugin verification

- `npm run check` passes for the complete workspace, including SDK pin checks,
  Touch Bar typecheck, 17 focused tests, and the production server build.
- `plugins/touchbar/test/verification-check.sh` passes the root check, package
  consumer inspection, live installed-plugin snapshot and guarded-stop smoke,
  plus an isolated clean-copy `npm ci` and focused plugin check.
- The native Swift app builds and ad-hoc signs on the connected Intel MacBook
  Pro, installs as a LaunchAgent, registers its Control Strip item, expands the
  horizontally scrollable system-modal panel, and reads the live BB snapshot.
- Physical Touch Bar captures were inspected iteratively for provider icons,
  compact status cards, project badges, priority/project sorting, and controls.
  The user approved the resulting behavior for integration into `main`.
- The native companion is intentionally macOS Touch Bar-only. A Windows Touch
  Bar runtime does not exist; the platform-neutral backend and package contracts
  are covered by the Linux workspace and POSIX shell checks.
