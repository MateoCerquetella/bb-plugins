# Design

## Approach

Update the two instruction surfaces that control agent behavior:

1. Add an explicit same-message rule to `server.ts`'s contributed
   instructions.
2. Add the matching rule to `skills/steel-browser/SKILL.md`.
3. Protect both strings with distribution tests covering credentials, sign-in,
   MFA, manual actions, and the prohibition on stale "above" references.

The existing `messageDirective` registration and `SteelBrowserDirective`
component remain unchanged. This preserves the established viewer lifecycle,
session scope, BB Connect boundary, and responsive behavior.

## Failure Prevention

The wording is intentionally duplicated because the server instruction is
always injected while the skill is selectively read. Tests assert both
surfaces independently, so future edits cannot silently weaken one path.

## Verification

Run the Steel Browser distribution test, package type checks, plugin build, and
the repository checks selected by Empirical. Run the inline browser check when
the project Steel CDP binding is available.

## Integration Blocker Repair

The Dockside runtime source already places root metadata in column 2 of its
two-column grid. Update only the stale source-contract regex from
`col-start-3` to `col-start-2`. Do not edit the Dockside component or CSS.
Verify with the focused Dockside test before rerunning pull-request CI.
