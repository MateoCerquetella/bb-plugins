# Verdict: CHANGES_REQUESTED

- PASS AC-1: The committed implementation samples Linux-local CPU and RAM, root disk, load/uptime, bounded directories, and memory-pressure/process diagnostics with explicit bounded cadences and retention.
- FAIL AC-2: The five ranges and gap insertion exist, but floor-aligned SQL buckets can produce 721 rows and added null gap sentinels can further exceed 720; sparse-history median gap detection can also connect gaps.
- PASS AC-3: Four dense current cards, two responsive SVG charts, directory usage/growth, and memory-pressure/process sections are present with mobile breakpoints.
- PASS AC-4: Package, route/title, repository metadata, and custom branded assets preserve Host Monitor identity.
- FAIL AC-5: Notification surfaces are removed and core errors are inline, but directory failures are swallowed and memory-diagnostic failures only logged, leaving the panel silent or stale.
- PASS AC-6: Fleet, floating, IP, termination, host-worker, and installable host artifacts are removed.
- PASS AC-7: Threshold settings and opt-in bounded read-only process attribution are correctly implemented.
- FAIL AC-8: Workspace checks pass, but store/snapshot integration and exact history-cap/gap edge cases lack tests.

## Security / correctness

CHANGES_REQUESTED: strict history bounding and complete inline failure reporting need repair; Linux process RSS also hard-codes a 4096-byte page size and can misreport on 16/64 KiB page systems.

## Design / maintainability

CHANGES_REQUESTED: architecture is coherent and smaller, but store/server behavioral tests are missing; shim devDependencies are SDK-required despite being unused at runtime.
