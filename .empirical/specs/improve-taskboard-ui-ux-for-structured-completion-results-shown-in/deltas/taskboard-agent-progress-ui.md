# Taskboard agent progress UI delta

## MODIFIED Requirements

### Requirement: Readable native progress
Taskboard SHALL show themed progress, collapsed commands, readable structured
results, actionable failures, and original-ticket navigation.

#### Scenario: Inspect a blocked review in its native thread
- GIVEN a Taskboard Review reports a blocked verdict
- WHEN the final assistant message renders
- THEN a native Taskboard result card identifies the Review as blocked
- AND the findings render as readable Markdown without a raw JSON object
- AND the structured verdict remains available to Taskboard automation

#### Scenario: Inspect a historical structured result
- GIVEN a stored Factory run uses the previous XML/JSON result contract
- WHEN Taskboard reads that run
- THEN it derives the same verdict, findings or summary, and revision
- AND it does not infer a successful verdict from unstructured prose

#### Scenario: Inspect a task failure
- GIVEN a Factory action, automatic continuation, tracker update, or native run
  failed
- WHEN the user opens the task
- THEN Taskboard identifies the failed operation
- AND Taskboard states the next available recovery action
- AND the exact technical message is available on request
- AND actions that are unsafe for the current state remain unavailable

#### Scenario: Inspect progress
- GIVEN associated Factory work
- WHEN opening progress
- THEN reported phase, steps and command outcome counts are visible
- AND commands and their output expand independently on request
- AND Original ticket opens the existing Taskboard provider detail.

#### Scenario: Follow automatic stages
- GIVEN an automatic task with current scope and an approved plan
- WHEN Investigate, Plan, and an implemented Build finish
- THEN each next stage starts in a distinct fresh native thread
- AND prompts carry explicit bounded handoff evidence
- AND Review uses the original managed Build environment

#### Scenario: Recover an actionable blocked Build
- GIVEN a blocked Build with findings and an unchanged approved plan and scope
- WHEN its original managed worktree and idle native thread remain available
- THEN Taskboard continues that Build at most twice automatically
- AND after the bound it exposes manual Continue
- AND needs-input, unknown results, and uncertain dispatch never auto-retry

#### Scenario: Observe resumed activity
- GIVEN a previously finished native session resumes
- WHEN Taskboard reconciles its paginated events and current thread state
- THEN the task shows active work before permitting another stage dispatch
- AND simultaneous observers cannot dispatch the next stage twice

#### Scenario: Select a historical session
- GIVEN a task has several stage runs and recovery attempts
- WHEN the user opens task progress
- THEN one selector identifies each run by stage, attempt, and status
- AND one Open session action navigates to the selected run
- AND explicit selection survives updates for the same task
- AND recovery actions continue to reflect the current task state

#### Scenario: Create a Taskboard work-item mention from a prompt
- GIVEN the New Thread composer contains a prompt
- WHEN Taskboard creates a work item and inserts its mention
- THEN the mention uses Taskboard's current branding artwork
- AND the create-from-prompt button keeps its existing ticket glyph
- AND the New Thread panel launcher keeps its Target icon


