# Local installation plan

1. Restore released GitHub adapter, environment helper, and regression tests from 8e6f27c4; identify the local build with a prerelease version. Run Taskboard's focused check and retain execution coverage.
2. Create a stable local checkout for installation. Disable the old plugin, make an owner-only rollback backup, replace its registration with the supported CLI, restore its secrets before load, and verify retained database state and running services.
3. For full setup, verify and install user-local OTP 28 and Elixir 1.19.5, build the pinned Symphony adapter, create private runtime configuration, and launch it as a user service. Check an empty queue before enabling Taskboard execution.
4. Record actual installation/test evidence, review source changes, commit feature records, and give concise usage instructions. Do not dispatch a paid task or change an external tracker.

Rollback: restore the previous plugin source and backed-up secrets/database; disable the new service and managed execution. Keep backups private and preserve all source commits.
