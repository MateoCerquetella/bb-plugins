# Touch Bar input routing repair

## ADDED Requirements

### Requirement: Native lane preserves scrolling and completed taps

The native lane MUST use horizontal scrolling while allowing AppKit to hit-test
child buttons and decide whether a touch ends as a click. Child controls MUST
use receiver-local hit-test points and MUST NOT dispatch actions from
`mouseDown`.

#### Scenario: Swipe cancels a potential click

- GIVEN a finger begins over a thread or settings control
- WHEN it moves horizontally across the lane
- THEN the lane scrolls and no child action is sent

#### Scenario: Short tap invokes exactly one action

- GIVEN a finger begins and ends without horizontal movement over a control
- WHEN AppKit completes button tracking
- THEN exactly that control's configured action is invoked

#### Scenario: Non-origin control remains tappable

- GIVEN a child button is positioned away from the lane origin
- WHEN AppKit hit-tests a receiver-local point
- THEN points inside its bounds are accepted without superview conversion

### Requirement: Hardware verification identifies the repair

The source build and installer MUST produce a running Intel Mac app whose log
identifies the repaired input build, and human verification MUST cover settings,
thread, and swipe interactions.

#### Scenario: Repaired app is installed

- GIVEN the enrolled Intel Mac is connected
- WHEN the native installer completes
- THEN it exits successfully and the log contains the repair marker
