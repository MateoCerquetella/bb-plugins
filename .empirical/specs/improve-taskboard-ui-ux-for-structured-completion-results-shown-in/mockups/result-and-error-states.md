# Result and error states

## Thread result

```text
┌────────────────────────────────────────────────────────────┐
│ ⊘  Review blocked                              REVIEW      │
│    8 blockers need changes before this can continue.      │
│                                                            │
│    View findings                                           │
└────────────────────────────────────────────────────────────┘

### Findings

- Acquisition-cost permission leaks.
- Historical allocation and purchase backfill is missing.
- Repeated-lot balances can become stale.
```

The native card carries only the stage, verdict, and short count or summary.
The assistant message keeps the full findings as ordinary Markdown below it.
The card is informational and does not introduce another action path.

## Task error

```text
┌────────────────────────────────────────────────────────────┐
│ !  Review could not finish                                │
│    Retry the review. If it fails again, open the session  │
│    to inspect the agent's last activity.                  │
│                                                            │
│    [Retry review]  [Open session]                         │
│                                                            │
│    › Technical details                                    │
└────────────────────────────────────────────────────────────┘
```

`Technical details` starts closed and reveals the exact error once. Existing
state-owned actions remain in their current location and order.

## Narrow layout

At 390px, the stage label moves below the title when needed. Buttons wrap as a
group, long error text wraps within the disclosure, and neither state scrolls
horizontally.

## Session navigation

```text
Investigate > Plan > Build > Review

Session [Build, attempt 3, blocked       v] [Open session]

Build blocked
Automatic continuation limit reached.
[Continue in thread]
```

The phase track summarizes observed progress and never implies human acceptance.
The selector includes stage, attempt, and status for each historical run. The
newest run is selected until the user chooses another. Keep that explicit choice
for the same task, falling back to the newest run if it disappears. On narrow
screens, the Open session action moves below the full-width selector.

Recovery controls always describe the current task, not the selected historical
session. A needs-input result asks for the missing decision without retrying.
Uncertain dispatch retains its existing explicit recovery control. Active
native work takes precedence over cached finished or paused labels.



