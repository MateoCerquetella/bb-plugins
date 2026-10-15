# Plan

1. Add conservative result-header parsing and focused behavioral tests. Preserve
   legacy XML/JSON results and existing verdict requirements.
2. Change emitted Build/Review instructions to the readable directive format.
3. Register the native result card and render structured Stage results.
4. Replace raw Factory error paragraphs with a shared diagnostic disclosure,
   preserving existing action predicates.
5. Run focused tests, typecheck and build; inspect desktop/mobile browser states
   and capture screenshots.
6. Review the exact diff and record actual evidence and remaining limitations.

## Throughput checkpoint

The parser is the first verifiable unit because both automation and UI consume
its result. UI integration follows only after its boundary tests pass. Existing
Factory tests cover state transitions; browser checks cover layout and controls.

## Iteration 3

1. Preserve the inherited result/error implementation and its historical
   verification. Add behavior tests for fresh main-stage threads and explicit
   bounded handoffs, then update dispatch and prompts.
2. Include initial Build results in automatic advancement. Add two bounded
   blocked-Build continuations and test all unsafe pause states.
3. Drain event pages and observe current thread activity before transitions.
   Test late resumed turns, stale completion, concurrency, and uncertainty.
4. Replace repeated session buttons with one selector and one navigation action.
   Keep latest-run recovery independent of historical selection.
5. Update the browser fixture for selection retention, selected navigation,
   current recovery actions, desktop, panel, and 390px states.
6. Run Taskboard focused checks and the Steel browser fixture. Capture and
   inspect screenshots. Review the exact source diff with fresh context.
7. Record actual evidence through Empirical. Leave integration and publication
   unclaimed unless their required gates run.

## Iteration 3 throughput checkpoint

- Blocking first steps: Specify, UI advisory, Design, and Plan pass before code.
- Independent workstreams: UI advisory completed separately. Implementation
  stays with one owner because service behavior and fixture expectations couple.
- Shared mutable state: only the implementation owner edits Taskboard source.
  The coordinator owns Empirical state and final verification.
- Smallest safe decomposition: preserve the existing schema, RPCs, lock, and
  recovery contract. Extend the current run ledger rather than add a scheduler.
