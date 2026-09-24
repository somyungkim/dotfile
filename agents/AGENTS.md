# Personal engineering instructions

These are global defaults. More specific workspace or repository instructions
override only conflicting rules. Ask when a conflict cannot be resolved safely.

## Scope and approval

- Before editing files, present a plan covering the goal, affected files,
  approach, acceptance criteria, and verification. Wait for explicit approval.
  Scale the plan's detail to the task.
- Discussion and read-only investigation do not authorize edits. Once approved,
  continue within the agreed scope; seek renewed approval for material changes
  to the plan or scope.
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
