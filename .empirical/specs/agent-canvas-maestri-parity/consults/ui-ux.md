# UI/UX advisory

Specialist: ui-ux
Verdict: advisory

## Question
Does this mockup show the clearest interface for the stated criteria, and what does it reveal that the criteria are still missing?

## Context and method
Focused review by the current agent, limited to spec.md and mockups/index.html and mockups/approval.md. This is a design-stage consult, not an independent implementation review.

## Assessment
The proposed layout follows the explicitly requested reference: restrained square-grid background, compact canvas nodes, central insertion pill, project/floor sidebar and bottom-right navigation. BB-native timeline and composer surfaces remain the functional substrate specified by the contract. The preview demonstrates a representative populated canvas and communicates visual direction clearly. Decorative mock agent execution is labeled illustrative; no behavior evidence is inferred from it.

## Findings

### F-1
- Severity: medium
- Category: state-coverage
- Location: mockups/index.html populated workspace and resource drawers; spec.md AC-UI-1
- Recommendation: Distinguish empty, loading, disconnected, failed-save and unavailable resource states. Preserve unsent drafts and expose a specific retry or insertion action.
- Resolution: Added these observable states to AC-UI-1. Preview remains a visual-direction example; implementation verification must exercise those states.

### F-2
- Severity: medium
- Category: interaction
- Location: mockups/index.html node headers, workspace labels and drawer controls; spec.md AC-UI-1
- Recommendation: Implement keyboard alternatives for dragging and resizing, accessible workspace buttons, tool names, visible focus, focus management and Escape dismissal. Distinguish attention and selection with text/shape as well as color.
- Resolution: Added keyboard operability, accessible names, focus return and non-color state distinction to AC-UI-1. Mockup is not a production accessibility conformance claim.

### F-3
- Severity: medium
- Category: layout
- Location: mockups/index.html 480px media query and clipped .canvas; spec.md AC-UI-1
- Recommendation: Preserve access to all nodes on small screens through a list or stacked view; scaling alone can hide nodes and make text unreadable.
- Resolution: Explicit small-screen node access added to AC-UI-1. The inherited stacked layout remains a candidate to satisfy it.

### F-4
- Severity: low
- Category: visual-consistency
- Location: mockups/index.html color tokens, unicode sample icons and 8–10px example footer text
- Recommendation: Map colors to BB theme tokens and replace illustrative glyphs with vendored/SDK icons; keep production content and controls readable at normal zoom. Use muted type only for secondary context.
- Resolution: Production token mapping is recorded in approval.md; design phase must specify readable type and icon implementation.

## Deliberately ruled out
No alternative direction was built. Copying Maestri marks, native window traffic lights, license UI or Swift internals is outside the contract. A cosmetic-only canvas and fake live agents are explicitly ruled out by the functional acceptance criteria.

## Remaining human decision
Visual-direction approval remains pending in mockups/approval.md. This advisory does not substitute for that approval.
