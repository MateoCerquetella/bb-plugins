# Plan

1. Add focused native-source regression assertions for asynchronous, bounded stdout capture; no EOF-dependent read; and bounded TERM/KILL cleanup.
2. Refactor `BBCommand.run` to drain stdout concurrently under a lock, cap retained output, detach the handler after the launched process exits, and enforce timeout cleanup without an unbounded pre-kill wait.
3. Run focused tests, then the complete Touch Bar workspace checks and clean/package consumer checks.
4. Inspect the diff against the acceptance criteria, record verification evidence, and complete independent review/integration through Empirical.
