---
description: Suggest a safe permission auto-allowlist (Claude Code /fewer-permission-prompts parity)
---

Help me reduce permission prompts safely $ARGUMENTS.

1. Inspect the current `permissions`, `policies`, and any saved approvals in the
   OpenCode config (global and project).
2. Identify the repetitive, clearly low-risk operations (e.g. read-only git
   inspection, formatters, test runners, local builds) that are good candidates
   for `allow` rules.
3. Explicitly list operations that must stay `ask` or `deny` (pushes, deletes,
   secret reads, network side effects, installs).
4. Propose an ordered `permissions` array following the "last matching rule wins"
   rule, with a one-line justification for each entry.

Present the proposed config as a snippet only. Do NOT edit any config file or
weaken a `deny` without my explicit confirmation.
