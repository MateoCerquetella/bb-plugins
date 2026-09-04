# Design

Apply PR #31 as the source-of-truth implementation. Add an isolated
Antigravity probe and server wiring, extend provider metadata and responsive
sidebar CSS, then update tests and README. Preserve existing provider probe
contracts and normalize Antigravity failures to an unavailable result.

## Verification

Run targeted usage-tracker tests followed by `npm run check`.
