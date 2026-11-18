// Optional device-local Edge MCP. Never overwrite a private overlay.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--target' || !args[1])) {
  throw new Error('Usage: node setup-edge.mjs [--target DIR]');
}
const target = path.resolve(args[1] || process.env.OPENCODE_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opencode'));
const dir = fileURLToPath(new URL('./edge/', import.meta.url));
const cli = path.join(dir, 'node_modules', '@playwright', 'mcp', 'cli.js');
const profile = path.join(target, '.local', 'edge-profile');
const overlay = path.join(target, 'opencode.jsonc');
const config = JSON.stringify({ mcp: { servers: { edge: { type: 'local',
  command: [process.execPath, cli, '--browser', 'msedge', '--user-data-dir', profile,
    '--caps', 'vision,pdf,devtools'], enabled: true } } } }, null, 2) + '\n';
const existing = fs.lstatSync(overlay, { throwIfNoEntry: false });
if (existing && (!existing.isFile() || fs.readFileSync(overlay, 'utf8') !== config)) {
  console.error(`Keeping existing ${overlay}. Merge this non-secret MCP entry there to enable Edge:`);
  console.error(config);
  process.exitCode = 2;
} else {
  // npm.cmd needs cmd.exe on Windows. Command text is constant (no user arguments).
  const win = process.platform === 'win32';
  const result = spawnSync(win ? 'cmd.exe' : 'npm', win ?
    ['/d', '/c', 'npm.cmd ci --ignore-scripts --no-audit --no-fund'] :
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit' });
  if (result.error || result.status !== 0 || !fs.existsSync(cli)) throw new Error('Edge MCP install failed');
  fs.mkdirSync(target, { recursive: true });
  if (!existing) fs.writeFileSync(overlay, config, { flag: 'wx', mode: 0o600 });
  console.log('Edge MCP ready. Keep the setup checkout at its current path.');
}
