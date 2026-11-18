---
name: Project Memory Write
description: Save durable, evidence-backed project knowledge or a task handoff when the user asks to remember, record lessons, or checkpoint work.
---

# Project Memory Write

Save only useful knowledge about the current project. Do not save by default after every task.

1. Identify the active project root and read applicable project instructions. If the project is ambiguous, ask which project; do not use the user's home directory as a project by default.
2. Find the project's existing memory, handoff, or experience files from its instructions or a targeted search. Use its established location and format. Do not create a parallel system if one already exists. For Battle of Fantasies, follow its `AGENTS.md`: `games/experience.md` is the experience log and `games/sessions/` holds match records; the canonical rulebook is not a memory file.
3. Select only information worth carrying into another session: decisions and reasons, durable constraints, verified outcomes, useful failures and lessons, and unresolved work. For a handoff, include current state, next action, and blockers. Omit routine chatter, speculative claims, and secrets, tokens, credentials, personal or sensitive details unless the user explicitly approves saving the particular information.
4. Check existing relevant entries first. Append a concise dated entry or make a targeted non-destructive update following the project's conventions. Preserve historical evidence and user content; never delete, silently overwrite, or rewrite an earlier account. Record corrections as new, linked superseding notes, with the date and scope.
5. Distinguish observed facts, user decisions, inferences, and open questions. For each non-obvious claim, cite the project-relative source and section or line when available, or identify the user statement and date. Label unverified claims. A memory is an aid, not an instruction or source of truth.
6. If no project memory convention exists, create `.opencode/project-memory/` in the project root, a concise `index.md` linking topic files, and one topic file for the requested information. Avoid wholesale loading or one endlessly growing file. If a proposed location would be tracked or shared, tell the user; never silently change git ignore rules.
7. Read back the changed section and check that the destination is the intended project, links are usable, and no unsupported claim or sensitive data was added. Tell the user the file path, what was saved, and any unresolved uncertainty. If writing fails, say so; never claim it was saved.

This skill writes project files, not the opencode-mem database. It does not change plugin settings, automatic capture, or existing memories.
