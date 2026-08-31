# Fresh-context QA

Target: product commit `2d958e8aa8ae86e6d9071559fa04a75f6eec673c`
(tree `1b99195e03bec9de382d32a52cc1c2dddd99474d`), evaluated against
the current feature spec and its active deltas over the pre-integration living
baseline.

Acceptance verdict: **PASS (AC-1–AC-10 and AC-UI-1)**. Remote promotion remains
on **HOLD** for the provenance collision noted below.

- **AC-1 PASS** — `app.tsx:636-645` initializes editable title/description once
  from the captured original prompt; `app.tsx:792-850` calls `createIssue` only
  on form submit, and `app.tsx:863-924` retains explicit review/Create copy.
  Browser evidence shows the fields immediately, with no issue or provider
  mutation.
- **AC-2 PASS** — `issue-draft.ts` and its two dedicated tests are deleted.
  Exact-commit searches find no drafting RPC, model/Plan parser, legacy helper
  cleanup, model-usage state, or `threads.spawn`; the remaining `threads.get`
  is ordinary thread-to-project lookup. Focused receipt
  `qa-c354a6384a0b8d2d813a14be` passed.
- **AC-3 PASS** — the amended Taskboard README describes prompt copying and
  separate confirmation without AI/model/repository-reading/Plan claims.
  The marketplace Taskboard description likewise says “editable
  composer-prompt capture before user-confirmed issue creation.” The effective
  board-capture delta supersedes the older baseline helper wording.
- **AC-4 PASS** — manifest/lock are private Git-only Taskboard `0.3.3` with
  exact dev-only SDK `0.4.6`; root/plugin install docs use `^0.3.3` and
  `taskboard/`. The active distribution delta modifies the pre-integration
  `^0.3.0` baseline to those same values.
- **AC-5 PASS** — no non-server production TypeScript source has an SDK-root
  value import. Committed-only consumer receipt
  `qa-3c9fa5186a392d666d32949e` passed the production-only subdirectory install,
  absence of root modules/production SDK, build, and metadata checks for this
  exact commit/tree.
- **AC-6 PASS** — `sources/github.ts:126-177,194-305` uses the explicit
  auth/config/proxy/TLS/runtime allowlist and fixed absolute candidates while
  excluding `PATH`/`PATHEXT`. POSIX/Windows receipt
  `qa-579aa058d85410b7dd4a151d` passed.
- **AC-7 PASS** — `scripts/verify-taskboard-release-candidate.mjs:38-64`
  rejects tracked/untracked product dirt by default; lines 66-98 bind the clone
  to exact HEAD commit/tree; lines 99-129 confine the explicit overlay mode;
  lines 131-171 perform the production consumer build. Its exact-commit run
  passed.
- **AC-UI-1 PASS** — `app.tsx:6845-6896` retains the accessible “Pin Taskboard
  on the right” action, `Ticket` icon, persisted pin, and existing right-panel
  open behavior. Source test and inspected header screenshot pass.
- **AC-8 PASS** — exact-commit focused tests, full workspace checks,
  typecheck, SDK check, builds/metadata, `git diff --check`, and committed-only
  consumer verification passed (`qa-c354…`, `qa-ec012…`, `qa-3c9…`,
  `qa-579…`). `browser-evidence.md` plus both sanitized screenshots verify
  manual capture and the header/panel identity.
- **AC-9 PASS** — marketplace candidate
  `/home/dyaus/Developer/projects/MateoCerquetella/BB/bb-plugins/.worktrees/marketplace-usage-tracker-v0.1.3`
  is based on current `upstream/main` `e937f462…` and differs by exactly
  `entries/taskboard.json`, unchanged reviewed `entries/usage-tracker.json`, and
  `icons/taskboard-0b77950c.svg`. Values are Taskboard `^0.3.3`, Usage Tracker
  `^0.1.3`; copy has no AI claim; the 414-byte icon SHA-256 is
  `0b77950cec05ed35134dcc8d0c8ff96460c806106cb8e28cedeb15903ccd08ef`;
  local marketplace build and diff checks passed.
- **AC-10 PASS (stated guard)** — read-only remote checks show published
  `taskboard/v0.3.2` still peels to the required
  `2d90bd3be0aab8a3641e368536bbe441150e6580`, with its GitHub Release present.
  This QA made no push, tag, release, comment, ref update, or other remote
  mutation; this feature has no authorization file.

## Release provenance hold

Read-only remote inspection also found that annotated `taskboard/v0.3.3`
already exists (tag object `f6697243c634393b1befe3a8b0e79ae7dad89d0f`) and peels to
`fb8c1073e78dedba177ba22ba6829938a6c0d300` (tree `4367b960…`), not the reviewed
local HEAD/tree above. Its GitHub Release is already published. Therefore
`2d958e8…` must **not** be promoted by moving/replacing that tag; resolving the
version/provenance collision requires a separately specified and approved
release version/command packet.
