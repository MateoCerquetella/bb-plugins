# Installation decisions

## D-001: Preserve installed behavior and use supported lifecycle operations

Status: Accepted

### Evidence

Live BB is 0.44.0 and loads Taskboard v0.3.4 from release 8e6f27c4. The execution branch has an older GitHub adapter that rejects optional ghState and lacks released CLI resolution safeguards. BB refuses a catalog-to-path install over an existing registration and documents deletion of secrets/settings/schedules on removal.

### Options

- Install the older adapter unchanged: rejected because it would regress the existing installation.
- Edit BB's registry database directly: rejected in favor of supported plugin lifecycle calls.
- Restore released adapter fixes, back up state, and replace the plugin registration using the supported CLI: selected.

### Chosen approach

Retain the released GitHub adapter and tests. Create a private backup before disabling/removing the old registration, restore secrets before install, and verify existing data and connections after reload. Use a stable local source. Full setup uses a native user-local runtime with an empty queue.

### Trade-offs and risks

Source replacement causes a brief Taskboard interruption. The native runtime needs a user-local toolchain and a private service environment. No credentials may be printed; no task may be launched as a setup test.

### Verification

Run Taskboard checks, compare retained state without exposing values, confirm the live source and services, and verify the optional runtime's healthy empty queue.
