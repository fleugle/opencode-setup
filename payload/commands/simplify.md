---
description: Simplify and clean up code without changing behavior (Claude Code /simplify parity)
agent: simplifier
subagent: true
---

Review the current changes $ARGUMENTS for opportunities to simplify, clarify, and
remove duplication WITHOUT changing observable behavior.

Look for: redundant code and dead branches, overly clever constructs, duplicated
logic that could be shared, needless abstraction, unclear naming, and missing
tests that would protect a refactor.

Propose concrete, minimal diffs, ranking by clarity and safety. Flag broad
rewrites or new dependencies. This agent is read-only: report suggestions, and
let the parent or user decide whether to apply them.
