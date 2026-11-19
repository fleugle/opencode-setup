# Personal OpenCode Desktop setup

Install the same shared OpenCode configuration on multiple machines from a Git revision. Installation is a local Node.js command. It does not start an OpenCode conversation, invoke a model, or ask an agent to configure anything.

## Install on another device

1. Install [OpenCode Desktop](https://opencode.ai/docs/), Git, and Node.js 22 or newer with npm on Windows, macOS, or Linux. Use a checkout outside the live OpenCode config directory. If using a ZIP, extract it and skip the Git commands below. The first install needs network access to provision Playwright MCP and Chromium. OpenCode downloads its pinned registry plugins on first startup.
2. Clone the setup repository (replace `YOUR_REPO_URL` with its actual URL) and choose your tested revision:

   ```sh
   git clone YOUR_REPO_URL opencode-setup
   cd opencode-setup
   git checkout YOUR_TESTED_TAG_OR_COMMIT
   node install.mjs
   ```

3. Supply `COARENA_API_KEY` through the device’s user environment or secret manager so it is visible to the OpenCode **background service**, not just to a terminal. Use OpenCode’s normal provider sign-ins on that device. Neither this checkout nor the installer supplies account credentials.
4. Open Desktop. Check that Router Stats opens, routing is in shadow mode, and the bottom-left Quota button shows the providers connected on this device. Quota values and router history are local/account data, not installation inputs.

For an update, fetch and check out the desired revision, then rerun `node install.mjs`. Do not edit the installed shared files as your usual update workflow: change the setup repo, review the diff, and deploy that revision instead.

The installer records the OS, source location, and destination in the installed `opencode-setup` skill so it can find the right checkout without assuming a Windows path or a fixed folder name. If you move the checkout, rerun the installer from its new location. A ZIP copy can install the setup, but it is not a Git checkout for editing shared settings.

By default the destination is `~/.config/opencode` on all three platforms, or `$XDG_CONFIG_HOME/opencode` when set. An explicit `OPENCODE_CONFIG_DIR` is honored by the installer; confirm a nondefault location with `opencode debug paths config`. `--target DIR` is for sandbox tests or an already configured destination: the flag alone does not redirect OpenCode. A linked parent directory is supported, but the config root and managed paths must not themselves be symlinks.

Router Stats includes its built Desktop bundle; no build step is required on the target. The main installer also provisions [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) and its bundled Chromium under the OpenCode config directory. The managed server is named `playwright`. It does not require Microsoft Edge, a browser extension, or a separate setup command. On Linux, Chromium may additionally need [system dependencies](https://playwright.dev/docs/browsers#install-system-dependencies).

## Private overrides

The installer supplies global `opencode.json`. Keep machine-specific overrides in the sibling `opencode.jsonc` on that device. OpenCode reads both names in that order. Leave the private service configuration, provider logins, session databases, and logs where OpenCode creates them.

**Existing installations:** back up the live config privately first. An older, full `opencode.jsonc` is not a small override: values there can mask the newly installed baseline. Keep only the settings intended for that device in the local override. Never move a backup containing credentials into this repository.

If you want this setup to **replace** a device's existing shared configuration instead of keeping its old overrides, preview the one-time takeover, then apply it:

```sh
node install.mjs --take-over --dry-run
node install.mjs --take-over
```

Review the preview before applying. Takeover backs up displaced files outside the active config directory, including the old global `opencode.jsonc` and extra auto-loaded global plugins. It does not migrate credentials from the old config or change `service.json`, saved logins, chats, or project files. Keep the printed backup private; it may contain old keys. Use the normal `node install.mjs` command for future shared updates.

If you need to roll back, close Desktop and restore the backed-up files to the original config folder using the same relative paths. Use the preview to identify files that were written but not backed up; remove only the files created by that takeover. Restore the installer manifest if it was backed up, or remove the newly created manifest if there wasn't one before. Rollback is manual.

After takeover, open Desktop in a folder without project-specific OpenCode settings. In the CLI, `opencode plugin list` lists loaded plugins; on Windows use the bundled `opencode-cli.exe` if `opencode` is not on PATH. Check for Router Stats (`opencode-model-router`), Quota, Ensemble, Runtime Fallback, Ponytail, Claude Parity, and Graphify. Check that Router Stats opens and the bottom-left Quota button appears; the default plugin list and a successful copy alone do not prove those features loaded.

Use `node install.mjs --keep-local` on a device with an intentional local overlay. It also skips conflicting locally modified files and reports their names. Without the flag, the installer stops on conflicts before writing. Modified files are never silently replaced, and obsolete files are reported for manual removal rather than deleted. When migrating from the old Edge helper, back up the overlay privately and remove only `mcp.servers.edge` after the new `playwright` server is connected. The old Edge profile is not imported or deleted.

## Package notes

The router's `dist/router-tool.mjs` bundles the runtime `tool` export from `@opencode-ai/plugin@1.18.18` with Zod. Relative imports resolve it without relying on a parent `node_modules` directory. Desktop supplies its GUI host modules. Router Stats and the shadow-routing setup do not require the router's Windows-only executor. Optional tools referenced by skills (for example, Graphify) still need their own installation. Installer tests have run on Windows; macOS and Linux have not yet had a native Desktop smoke test.

Run `node --test test/install.test.mjs` to test installation behavior without changing your own OpenCode config.
