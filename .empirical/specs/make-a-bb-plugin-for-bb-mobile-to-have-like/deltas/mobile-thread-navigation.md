## ADDED Requirements

## Purpose

Give mobile BB users a fast, safe way to move between eligible threads without
leaving the conversation surface.

### Requirement: Mobile threads support continuous one-thumb navigation
Dockside MUST show mobile previous/next controls and a swipeable title above
the current thread composer. It MUST use native thread navigation, include the
current thread plus visible non-archived active and unread threads from every
project, and order them by latest attention with deterministic fallbacks.

#### Scenario: User browses active work across projects
- **Given** three eligible threads from multiple projects and the middle thread open on mobile
- **When** the user taps next or deliberately swipes left on the strip
- **Then** the next thread opens exactly once through host navigation
- **And** the final thread's next action opens the first thread

#### Scenario: User moves backward from the first thread
- **Given** the first thread is open in a queue with more than one thread
- **When** the user taps previous or swipes right
- **Then** the final thread opens

#### Scenario: User has only one eligible thread
- **Given** a singleton queue
- **When** the strip renders
- **Then** both controls remain disabled

### Requirement: Project context uses Dockside's effective color
Each eligible thread MUST show a compact project initial beside its title.
The badge MUST use the same automatic or custom effective project color as
Dockside and update when Dockside's synchronized color setting changes.

#### Scenario: User customizes a project color
- **Given** a project has a custom color in Dockside settings
- **When** one of its threads appears in the mobile navigation queue
- **Then** its project badge uses that custom color and a readable foreground

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

### Requirement: Dockside mobile navigation is released immutably
The verified Dockside package MUST be installable as version 0.1.6 and the
`dockside/v0.1.6` tag MUST identify the exact reviewed release commit.

#### Scenario: User installs the new Dockside release
- **Given** Dockside v0.1.5 is currently installed
- **When** it is replaced with the verified v0.1.6 package
- **Then** Dockside v0.1.6 is running with the mobile navigation bundle
- **And** the pushed release tag identifies that exact source commit
