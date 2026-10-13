## ADDED Requirements

## Purpose

Give mobile BB users a fast, safe way to move between eligible threads without
leaving the conversation surface.

### Requirement: Mobile threads support bounded one-thumb navigation
Thread Glide MUST show mobile previous/next controls and a swipeable title
above the current thread composer. It MUST use native thread navigation,
stay within the current project, exclude hidden/archived threads and order
roots deterministically by creation time descending with ID tie-breaking.
The current child MAY be included so a child view is not stranded.

#### Scenario: User browses the current project
- **Given** three eligible threads and the middle thread open on mobile
- **When** the user taps next or deliberately swipes left on the strip
- **Then** the next thread opens exactly once through host navigation
- **And** the final thread disables next instead of wrapping

### Requirement: Gestures preserve ordinary conversation interaction
Only horizontal gestures beginning on the strip title MUST navigate.
Vertical, short, cancelled and multi-touch gestures MUST not navigate.
Desktop MUST retain its normal layout without the strip.

#### Scenario: User reads a long response
- **Given** a mobile thread is open
- **When** the user scrolls the conversation or vertically drags the strip
- **Then** no thread navigation occurs

### Requirement: Unavailable lists fail safely
Loading and failed requests MUST disable navigation. Results for old thread
identities MUST be discarded. The plugin MUST not mutate thread content,
archive state or project configuration.

#### Scenario: A request fails
- **Given** a thread list request fails
- **When** the strip renders
- **Then** both navigation arrows are disabled and a retry is available

### Requirement: Current thread status uses live host semantics
The strip MUST show the current thread's host-provided accessible indicator
label. When BB reports no indicator, it MUST show "Idle". The plugin MUST NOT
infer status from message text, timestamps, or thread titles.

#### Scenario: Thread begins or finishes work
- **Given** the current thread is visible in BB's live sidebar projection
- **When** BB changes its indicator or accessible indicator label
- **Then** Thread Glide updates the compact status without navigating
- **And** the status remains distinguishable from the numeric thread position
