# Grouped ticket team mockup

## Desktop

```text
Factory progress                                      Awaiting Build
─────────────────────────────────────────────────────────────────────
▾ #124 Checkout loses draft after refresh
  Coordinator                  idle               Open thread
  ├─ Investigation             finished           Open thread
  ├─ Plan                      finished           Open thread
  ├─ Build                     running            Open thread
  └─ Review                    waiting

  Build activity
  Running focused Taskboard tests
```

The ticket title labels the group. The coordinator is the stable first row.
Children use a role label and a native state label. **Open thread** remains the
same Taskboard button action that progress already uses. A waiting role has no
button until Taskboard creates its native child.

## Mobile

```text
Factory progress
────────────────────────────
▾ #124 Checkout loses draft

  Coordinator        idle
  Open thread

  Investigation      finished
  Open thread

  Plan               finished
  Open thread

  Build              running
  Open thread

  Review             waiting

  Build activity
  Running focused tests
```

Rows stack their action below role and state at narrow widths. The component
uses the existing Taskboard spacing, border, button, and status tokens. The
group has no nested card.

## States

- **Starting coordinator** shows one pending coordinator row and no child rows.
- **Coordinator uncertain** replaces the action with the existing recovery
  control and blocks automatic child dispatch.
- **Paused** keeps existing rows and shows the project or ticket blocker above
  the group: `Factory paused. No new automatic stages will start.` Existing
  `Open thread` actions remain available.
- **Provider read failed** shows `Provider unavailable` with the short live-read
  error above the group. The existing native thread actions remain available.
- **Stale eligibility** shows `Provider status stale. Eligibility could not be
  confirmed.` followed by the live-read reason above the group. Cached data
  does not authorize dispatch.
- **Scope changed** shows `Scope changed. Review the updated ticket before
  continuing.` above the group, with existing native thread actions available.
- **Closure changed** shows `Ticket closed. No new automatic stages will start.`
  above the group, with existing native thread actions available.
- **Legacy workflow** shows an ungrouped "Legacy sessions" label. Taskboard does
  not claim that those native threads have a coordinator.

The blocker is an unframed status region immediately above the coordinator row,
inside the expanded ticket section. Its label and reason remain visible in the
collapsed summary too. Reasons wrap, rather than relying on a tooltip. Provider
errors may clear after a successful live refresh, but there is no action that
bypasses live validation. Scope and closure blockers have no automatic retry.
Coordinator uncertainty exposes the existing link-recovery control with the
reason `Coordinator creation could not be confirmed. Link the existing thread.`
Recovery must not create a replacement thread.

## Responsive and keyboard behavior

Ticket titles and blocker reasons wrap at word boundaries, including unbroken
identifiers when needed. They are not clipped or horizontally scrolled. Provider
identity in Project Manage follows the same rule. At narrow widths, actions
stack beneath role and state, as shown above, rather than shrinking text.

The disclosure is a button with `aria-expanded`, visible focus, and Enter/Space
activation. Each `Open thread` and recovery action retains its visible focus
target in normal tab order. Role and state remain text, not color alone.
User-expanded or collapsed state is keyed by ticket identity and retained
across data refresh while the ticket is present. Initial mount is expanded;
persistence across navigation or browser reload is not required.
