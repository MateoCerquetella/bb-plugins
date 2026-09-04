# Plan

1. Add a bounded fleet mini-modal projection/parser and focused tests.
2. Implement a cleanup-safe content-script modal anchored to the native footer
   action with open/refresh/close/Escape/outside/navigation behavior.
3. Restore the footer toggle event and dedicated Host Monitor `navPanel`; remove
   the monitor `settingsSection` destination.
4. Style the compact modal with BB tokens and responsive internal scrolling;
   retain the full Grafana-style page unchanged.
5. Update registration, safety, lifecycle, responsive, and documentation tests;
   run typecheck, all focused tests, and build.
6. Install/reload the worktree; exercise mixed host fixtures, live four-host
   data, two-host configuration persistence, and service health.
7. Extend Chromium automation through icon → mini-modal → dedicated page,
   capture modal/page/editor desktop and 390px evidence, run workspace checks,
   isolated review, and stop before integration/deployment.
