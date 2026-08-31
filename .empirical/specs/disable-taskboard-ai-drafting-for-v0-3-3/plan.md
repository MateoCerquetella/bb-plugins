# Plan: Disable Taskboard AI Drafting for v0.3.3

1. Simplify composer capture to populate editable title/description exactly once
   from the original prompt. Remove drafting state, polling, cancellation,
   regeneration, model copy/icons, and any submission dependency on draft state.
2. Remove issue-draft schemas/RPCs, helper module, server spawn/reconciliation/
   event/storage cleanup, and dedicated tests. Add static UI/distribution tests
   proving there is no Taskboard helper/model/Plan/thread-spawn path and manual
   fields plus separate Create behavior remain.
3. Rewrite active Taskboard and marketplace copy to describe manual prompt
   capture with no AI/model/repository-reading claim. Preserve version `0.3.3`,
   direct range `^0.3.3`, icon, provider support, and separate issue confirmation.
4. Apply the committed-only verifier hardening: reject product dirt by default,
   compare clone HEAD commit/tree, retain explicit non-authoritative overlay
   mode, and pin root `bun run ci` plus source assertions.
5. Run focused tests, full Taskboard suite, typecheck, SDK check, build/metadata,
   static searches, root check, browser exercise, and non-authoritative overlay
   validation while editing. Commit the exact source and workflow state.
6. Run default committed-only/full-CI verification and fresh-context security/
   code review against the final commit; integrate capability deltas locally.
7. Amend and validate the current-base marketplace three-file commit, recheck
   public tags and remote leases, then present every source/release/PR command
   for separate approval. Perform no remote mutation in this workflow.
