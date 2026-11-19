---
description: Insights report on how I work, from real usage data (Claude Code /insights parity)
---

Analyze my recent OpenCode usage $ARGUMENTS.

Get the data first: `opencode stats --full --json` (use the bundled
Desktop's bundled `opencode-cli.exe` on Windows if `opencode` is not on PATH). Add
`--days N` to narrow the window, or `--project .` for this project only.

Then report: the task types I run most, the models/agents/tools I lean on, where
I hit friction (failed runs, tool reliability, retries), and 3-5 concrete
suggestions (commands to add or delete, permissions to pre-allow, agents to
specialize).

Mark measured numbers as measured and keep your own inference separate. Do not
edit any config without asking.
