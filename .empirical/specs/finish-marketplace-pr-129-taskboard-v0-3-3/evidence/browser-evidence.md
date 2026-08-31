# Browser evidence: Taskboard 0.3.3 header action

- Surface: local BB 0.40 thread route with Taskboard `0.3.3` installed from the
  isolated source worktree.
- Runtime: `taskboard` enabled and running; frontend bundle SDK `0.4.23` reports
  compatible.
- Accessibility snapshot: thread actions contain the enabled button
  `Pin Taskboard on the right`; the pinned panel exposes
  `Unpin Taskboard from the right panel` with pressed state.
- Visual result: the header action renders the Taskboard ticket glyph and the
  pinned right panel uses the same product identity. The generic panel glyph is
  not used for the Taskboard action.
- Behavior: the action opened and pinned the existing right panel without
  changing its compact header geometry or accessible name.
- Screenshot: `evidence/taskboard-header-v0.3.3.png`, 1880×806 PNG,
  SHA-256 `d193263fde5e254f1cecd1588941a5a5ccff6d90f78ac5cc65cd1e9d1a71a633`.
  Opaque browser-only overlays redact the thread/sidebar content; the evidence
  retains only the actual header control and Taskboard panel.
