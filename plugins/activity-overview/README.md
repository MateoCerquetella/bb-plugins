# Activity Overview

Activity Overview is a compact BB dashboard for scanning contributions, pull
requests, reviews, streak patterns, and follow-up items. It uses deterministic
local sample data so the surface works without credentials; period and
repository filters update the summary immediately.

Install from the workspace root:

```sh
npm install
npm run check --workspace bb-plugin-activity-overview
bb plugin install ./plugins/activity-overview --yes
bb plugin reload activity-overview
```
