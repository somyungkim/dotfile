@~/.config/agents/AGENTS.md

## Claude Code specifics

These override the shared file above where they conflict.

- **PDFs** → run `mac-ocr <path>` via Bash and read its text output. Do NOT use the Read tool on PDFs - Read renders each page to an image (token-heavy) and fails on scanned/image-only PDFs.
- **Library / framework docs** → use the context7 MCP tools (`resolve-library-id`, then `query-docs`); do not shell out to `npx ctx7` here.
- **File size** → skip files over 100KB unless the task requires them. If one is required, use `Read` with `offset`/`limit` to target the relevant slice.
