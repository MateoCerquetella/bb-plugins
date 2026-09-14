# Implementation plan

1. Align Taskboard SDK declarations with pinned workspace BB; add typed preparation contract, persistence and isolated host entry.
2. Implement bounded context inventory/retrieval, strict source filters and local artifact storage; test host-routing/secret/symlink limits.
3. Add native composer preparation reference and bootstrap tool; persist actual thread/environment/execution settings and optional existing Taskboard reference.
4. Implement durable BB-agent jobs for brief and prototype output, CAS edits/proposals, retries, version selection, readiness and export.
5. Add real BB panels and native theme styling for brief/sources/conversation/prototypes/history; sandbox previews.
6. Build, run focused tests, install/reload local Taskboard, exercise the actual BB flow and document target production digest and SDK limitations; run workspace checks and independent review.
