---
description: Show running sessions and background work (Claude Code /tasks parity)
---

Report active work $ARGUMENTS.

Run `opencode api get /api/session/active` (use the bundled `opencode-cli.exe`
from the windows-env skill if `opencode` is not on PATH). It returns a map of
session ID to state, e.g. `{"ses_...": {"type": "running"}}`.

For each ID, look up title, agent and model in `opencode api get /api/session`
and report one line per session: `<title> — <agent>/<model> — <state>`.

Add any background shell job you started in this session, and flag anything that
looks stuck (long running, failed outcome). If `data` is empty, say nothing is
running. Do not spawn, message or kill anything.
