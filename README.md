# Personal OpenCode Desktop setup

Install the same shared OpenCode configuration on multiple machines from a Git revision. Installation is a local Node.js command. It does not start an OpenCode conversation, invoke a model, or ask an agent to configure anything.

## Install on another device

1. Install OpenCode Desktop, Git, and Node.js 22 or newer (tested with Node 24 and OpenCode 2.3.2 on Windows). Use a checkout outside the live OpenCode config directory. If using a ZIP, extract it and skip the Git commands below. The Node installer itself does not need network access. OpenCode downloads its pinned registry plugins on first startup.
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

Router Stats includes its built Desktop bundle; no build step is required on the target. For the optional Edge browser MCP, install Microsoft Edge and run `node setup-edge.mjs` after the baseline installer. This installs the locked Playwright MCP and points it at a dedicated browser profile. Keep the checkout in place. The helper creates a local override only when safe; if you already have a different override, it prints the entry to merge and leaves the file untouched. Both scripts support `--target DIR` for a nondefault config folder.

## Private overrides

The installer supplies global `opencode.json`. Keep machine-specific overrides in the sibling `opencode.jsonc` on that device. OpenCode reads both names in that order. Leave the private service configuration, provider logins, session databases, and logs where OpenCode creates them.

**Existing installations:** back up the live config privately first. An older, full `opencode.jsonc` is not a small override: values there can mask the newly installed baseline. Keep only the settings intended for that device in the local override. Never move a backup containing credentials into this repository.

Use `node install.mjs --keep-local` on a device with an intentional local overlay (including Edge). It also skips conflicting locally modified files and reports their names. Without the flag, the installer stops on conflicts before writing. Modified files are never silently replaced, and obsolete files are reported for manual removal rather than deleted.

## Package notes

The router's `dist/router-tool.mjs` bundles the runtime `tool` export from `@opencode-ai/plugin@1.18.18` with Zod. Relative imports resolve it without relying on a parent `node_modules` directory. Desktop supplies its GUI host modules. The optional Windows environment skill from the original workstation was omitted because it described that specific installation. Optional tools referenced by skills (for example, Graphify) still need their own installation.

Run `node --test test/install.test.mjs` to test installation behavior without changing your own OpenCode config.
