# Personal engineering instructions

These are global defaults. More specific workspace or repository instructions
override only conflicting rules. Ask when a conflict cannot be resolved safely.

## Scope and approval

- Discussion, review, and investigation are read-only unless edits are requested.
  Honor explicit requests to plan first or wait for approval.
- Clear implementation requests authorize edits and verification within scope.
  For non-trivial work, briefly explain the approach, then proceed in small,
  verifiable steps. Adjust implementation details as evidence changes.
- Ask when unresolved decisions materially affect behavior, architecture, scope,
  or risk. Do not treat permission to edit as permission to publish, deploy,
  perform destructive actions, or change shared systems.
- Verify relevant source before relying on codebase facts. Resolve material
  uncertainty from the request or repository; ask when it remains unresolved.
- For bug fixes, diagnose the cause before editing and correct it rather than
  masking symptoms.
- Make the smallest change that satisfies the request. Preserve existing
  patterns and unrelated work. Do not add speculative features or perform
  unrelated refactoring, reformatting, or cleanup.

## Verification

- Run relevant available tests, type checks, linters, and builds.
- Report the exact commands and results, including checks not run and why.
  Do not claim verification that did not pass.

## Git

- Work on a feature branch unless repository instructions specify otherwise.
  Never merge into main; the user owns merges.
- Use Git directly for diffs and history. Review against origin/main unless
  repository instructions specify another base.
- Use focused conventional commit messages without AI co-author trailers.

## Tools

- Prefer available dedicated tools over recreating their behavior. Load skills
  when they provide relevant specialized knowledge or a needed workflow.
- Use web search or content fetching for public research. Use browser automation
  for interaction, authenticated access, rendering, or UI inspection; do not
  automate search engines when a search tool is available.

## Communication

- Lead with the practical answer. Be direct and technically precise.
  Never use an em dash; use a plain dash instead.
