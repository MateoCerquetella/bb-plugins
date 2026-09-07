# Security Consult

- Specialist: security
- Verdict: advisory

## Finding SEC-001: Importable preset is an executable supply-chain boundary

- Severity: medium
- Category: local code execution / supply-chain integrity
- Location: `spec.md` AC-5 and Verification; `deltas/touchbar-agent-monitor.md` Persistent all-app companion
- Exploit: BetterTouchTool presets can carry scripts. A substituted or silently modified preset could execute arbitrary commands whenever its two-second widget refresh runs, with the user's account authority. The contract asks for an importable preset but does not itself limit the embedded scripts, require review-before-import, or prove that tap actions cannot reach the guarded `stop` command.
- Recommendation: Keep installation reviewable and non-automatic. The smallest closing control is a source-level preset test that allowlists the global shell-widget type, refresh command, exact `open-card` tap action, persistent visibility flag, and bounded widget count; reject `stop`, network commands, and additional actions. Document that the installer opens the preset for review rather than importing it silently.

## Finding SEC-002: Slot-based preset taps have a non-destructive time-of-check gap

- Severity: low
- Category: UI integrity / confused target
- Location: `spec.md` AC-3 and AC-5; `deltas/touchbar-agent-monitor.md` Explicit safe controls and Import and refresh scenarios
- Exploit: If the ordering changes after a shell widget renders but before its `open-card N` action executes, the tap can open a different current thread in the same slot. This cannot stop or modify the thread, but it may surprise the user or briefly expose a different thread title in BB.
- Recommendation: Keep physical preset taps open-only, resolve every direct mutation by exact id, and document the slot race. Offer the Swift companion when frame-bound exact thread identifiers are preferred. No destructive action should be added to a slot without a confirmation and exact-id binding.

## Conclusion

No blocking security finding remains when the preset is source-audited,
review-before-import is preserved, hidden workers stay excluded by default, and
the physical strip remains open-only. The explicit CLI `stop` guard is outside
the preset's action allowlist.
