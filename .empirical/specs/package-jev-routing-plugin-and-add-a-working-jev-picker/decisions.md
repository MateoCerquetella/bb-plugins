# Decisions

## D-001: Independent Dyaus runtime

Status: Accepted

### Evidence
The user explicitly selected independent Dyaus routing. The prior service and credential were on the Mac. The Dyaus Codex smoke test now returns OK with a recorded Jev apply decision for Luna/low.

### Options
Connect Dyaus to the Mac by tunnel, or install loopback router services on Dyaus.

### Chosen approach
Use independent user services on Dyaus and structured native model registration.

### Trade-offs and risks
This requires maintaining the local router and TypeSafe credential on Dyaus. Automatic routing is limited to the Codex Responses transport; arbitrary provider tracking remains independent.

### Verification
Check service health, an ephemeral Codex execution, routing decision log and real BB model picker. Run plugin and inherited runtime tests.

## Supporting decisions

- Run independently on Dyaus, as explicitly requested by the user. A tunnel to the Mac was considered and rejected because it requires that machine to remain online.
- Use native model catalog registration rather than a decorative DOM option: the selected model must execute successfully.
- Preserve the existing eight-row history dialog and remove polling writes to timeline events. This addresses repeated conversation text.
- Ship the upstream Jev runtime with its MIT license; add only the HTTP user-agent compatibility fix. Keep the Codex Router installation external and documented.
- Verify with TypeScript checks, focused server tests, inherited routing tests, actual Codex execution and a browser screenshot of the live picker.
