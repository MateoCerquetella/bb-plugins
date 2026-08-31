# Browser evidence: Taskboard 0.3.3 manual capture

- Runtime: local BB 0.40 with Taskboard `0.3.3` installed from the final
  `taskboard-v0.3.3-no-ai` worktree; plugin and sync service reported running,
  frontend SDK `0.4.23` compatible.
- Action: entered the benign composer text `Manual capture browser evidence
  only` and opened `Create Taskboard issue` without submitting the composer or
  issue form.
- Result: the modal appeared immediately with the exact text in both editable
  Title and Description fields. Copy stated that the prompt was copied for
  review and nothing is created until Create. The rendered dialog contained no
  AI, model, Plan, repository-reading, generation, retry, or drafting state.
- Provider unavailable state: GitHub setup guidance remained separate while the
  captured fields stayed visible and editable; no Create mutation was possible.
- Cleanup: closed the modal and cleared the temporary composer text. No issue,
  thread, provider request, or external mutation was created.
- Manual-capture screenshot: `evidence/manual-capture-v0.3.3.png`, 1880×806,
  SHA-256 `b49b1136480755d482cbd0585d7d3aad9f0efdea78de721bcaaa9f7ddf284c93`.
- Header/panel screenshot: `evidence/taskboard-header-no-ai-v0.3.3.png`,
  1880×806, SHA-256
  `971819de39ed81a917ea416396f8cb8cf15f516c257c27aab0c83f46881f6304`.
- Both screenshots use opaque browser-only overlays outside the evidence region
  to avoid retaining unrelated thread/sidebar content.
