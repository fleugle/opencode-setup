---
description: Security review of pending changes (Claude Code /security-review parity)
agent: security-reviewer
subagent: true
---

Perform a security-focused review of the current changes $ARGUMENTS.

Prioritize, in order:
1. Injection flaws (SQL/command/template/prompt injection) and untrusted input handling.
2. Authentication, authorization, and session/permission boundary mistakes.
3. Secrets, credentials, tokens, and sensitive data exposure (logging, errors, files).
4. Unsafe deserialization, path traversal, SSRF, and insecure defaults.
5. Dependency / supply-chain and cryptography misuse.

For each finding give: severity (critical/high/medium/low), file + line, why it is
exploitable, and a concrete fix. Do not edit files — report only. If there are no
findings, say so explicitly and list what you checked.
