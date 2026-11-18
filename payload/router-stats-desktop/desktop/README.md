# Router Stats for OpenCode Desktop

Open **Router Stats** from the command palette, `/router-stats`, or the Review panel's **+** menu.
The panel reads the existing router log, shows up to 50 recent decisions, and does not submit a prompt.
The terminal's `/router stats` keeps the text report and posts it without starting an assistant turn.

This is a local copy of `opencode-model-router` 2.9.1. The global config loads it **instead of** the published package, under the same plugin ID. It shares the existing overrides and stats, and does not auto-update to upstream versions.

Run `npm run build:desktop` to rebuild after changing the GUI, and `npm test -- desktop/stats.test.ts` to exercise the data path. To revert to upstream, replace `"./router-stats-desktop"` in the global `opencode.jsonc` with `"opencode-model-router@2.9.1"` and reload.
