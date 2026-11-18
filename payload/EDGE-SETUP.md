# Optional Edge MCP

The shared configuration omits the machine-specific Edge MCP. To enable it,
install `@playwright/mcp` and Microsoft Edge on the target machine, then add a
local `edge` server under `mcp.servers` in your own OpenCode configuration.
Set its command to the local Node executable followed by the installed
`@playwright/mcp/cli.js`, `--browser`, `msedge`, `--user-data-dir`, and a
machine-local profile directory. Add `--caps`, `vision,pdf,devtools` if those
capabilities are needed. Only add `--allow-unrestricted-file-access` if you
trust the server with access to your files.

Set `COARENA_API_KEY` in the OpenCode service's environment before using the
Coarena provider or quota integration.
