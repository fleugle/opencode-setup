#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const manifestName = '.opencode-setup-manifest.json';
const hash = data => createHash('sha256').update(data).digest('hex');
const exists = file => {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const fail = message => { throw new Error(message); };

// Reject links in managed paths after resolving the chosen root's parent.
function safePath(file) {
  const absolute = path.resolve(file);
  const root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = exists(current);
    if (stat?.isSymbolicLink()) fail(`Unsafe symlink: ${current}`);
    if (stat && current !== absolute && !stat.isDirectory()) fail(`Not a directory: ${current}`);
  }
}

function canonicalParent(dir) {
  if (exists(dir)) return fs.realpathSync(dir);
  return path.join(canonicalParent(path.dirname(dir)), path.basename(dir));
}

function validName(name) {
  return typeof name === 'string' && name !== '' && !name.includes('\\') &&
    !name.split('/').some(part => !part || part === '.' || part === '..' ||
      part.includes(':') || /[<>|"?*\x00-\x1f]/.test(part) ||
      /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

function writeAtomic(file, data) {
  const temp = path.join(path.dirname(file), `.opencode-setup-${randomBytes(16).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, data, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (exists(temp)) fs.unlinkSync(temp);
  }
}

function install() {
  let target;
  let keepLocal = false;
  let takeOver = false;
  let dryRun = false;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keep-local') keepLocal = true;
    else if (args[i] === '--take-over') takeOver = true;
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--target' && args[i + 1] && !args[i + 1].startsWith('--')) target = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: node install.mjs [--target DIR] [--keep-local | --take-over] [--dry-run]\n--target DIR  Install into DIR instead of the global config directory.\n--keep-local  Skip conflicting local files and allow an existing opencode.jsonc overlay; use on every run with an overlay.\n--take-over  Back up and replace conflicts and deactivate extra global plugins.\n--dry-run  Preview without modifying files.');
      return;
    } else fail(`Unknown or incomplete option: ${args[i]}`);
  }
  if (takeOver && keepLocal) fail('--take-over cannot be combined with --keep-local');
  target = path.resolve(target || process.env.OPENCODE_CONFIG_DIR ||
    path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'opencode'));
  if (target !== path.parse(target).root)
    target = path.join(canonicalParent(path.dirname(target)), path.basename(target));
  const payload = path.join(path.dirname(fileURLToPath(import.meta.url)), 'payload');
  safePath(payload);
  if (!exists(payload)?.isDirectory()) fail(`Payload directory not found: ${payload}`);
  safePath(target);

  const files = new Map();
  function collect(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!validName(name) || entry.isSymbolicLink()) fail(`Unsafe payload path: ${name}`);
      if (entry.isDirectory()) collect(path.join(dir, entry.name), name);
      else if (entry.isFile()) {
        if (entry.name.toLowerCase() === 'service.json' || name.toLowerCase() === manifestName.toLowerCase())
          fail(`Reserved payload path: ${name}`);
        files.set(name, fs.readFileSync(path.join(dir, entry.name)));
      } else fail(`Unsupported payload entry: ${name}`);
    }
  }
  collect(payload);
  if (!files.has('opencode.json')) fail('Payload must contain opencode.json');
  const quotaPackage = 'quota-desktop/package.json';
  const quotaLock = 'quota-desktop/package-lock.json';
  const hasQuota = files.has(quotaPackage) && files.has(quotaLock);
  if (!hasQuota && (files.has(quotaPackage) || files.has(quotaLock))) fail('Incomplete Quota Desktop payload');
  const packageName = 'playwright-mcp/package.json';
  const lockName = 'playwright-mcp/package-lock.json';
  const hasPlaywright = files.has(packageName) && files.has(lockName);
  if (hasPlaywright) {
    const config = JSON.parse(files.get('opencode.json').toString('utf8'));
    const server = config.mcp?.servers?.playwright;
    if (!server) fail('Payload is missing the Playwright MCP configuration');
    server.command = [process.execPath, path.join(target, 'playwright-mcp', 'node_modules', '@playwright', 'mcp', 'cli.js'), '--browser', 'chromium', '--isolated', '--caps', 'vision,pdf,devtools'];
    server.environment = { ...server.environment, PLAYWRIGHT_BROWSERS_PATH: path.join(target, 'playwright-mcp', 'browsers') };
    files.set('opencode.json', Buffer.from(`${JSON.stringify(config, null, 2)}\n`));
  } else if (files.has(packageName) || files.has(lockName)) fail('Incomplete Playwright MCP payload');
  const skillName = 'skills/opencode-setup/SKILL.md';
  const originalSkill = files.get(skillName);
  if (originalSkill) {
    const checkout = path.dirname(fileURLToPath(import.meta.url));
    const encoded = Buffer.from(checkout, 'utf8').toString('base64');
    const encodedTarget = Buffer.from(target, 'utf8').toString('base64');
    files.set(skillName, Buffer.from(`${originalSkill.toString('utf8')}\n## Installer location (machine-local data)\n\n- Node platform: ${process.platform}\n- Installer checkout path (UTF-8, base64): ${encoded}\n- Installed config path (UTF-8, base64): ${encodedTarget}\n`));
  }

  const manifestPath = path.join(target, manifestName);
  safePath(manifestPath);
  let previous = {};
  if (exists(manifestPath)) {
    if (!exists(manifestPath).isFile()) fail('Invalid manifest path');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { fail('Invalid installer manifest'); }
    if (!manifest || manifest.version !== 1 || !manifest.files ||
        typeof manifest.files !== 'object' || Array.isArray(manifest.files)) fail('Invalid installer manifest');
    for (const [name, digest] of Object.entries(manifest.files)) {
      if (!validName(name) || name.toLowerCase() === manifestName.toLowerCase() ||
          name.split('/').at(-1).toLowerCase() === 'service.json' ||
          typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) fail('Invalid installer manifest entry');
    }
    previous = manifest.files;
  }

  const writes = [];
  const conflicts = [];
  const next = { ...previous };
  const backups = new Map();
  function backup(name) {
    const source = path.join(target, ...name.split('/'));
    safePath(source);
    const stat = exists(source);
    if (!stat) return;
    if (!stat.isFile() && !stat.isDirectory()) fail(`Unsupported backup path: ${source}`);
    backups.set(name, stat);
  }
  const jsonc = path.join(target, 'opencode.jsonc');
  safePath(jsonc);
  const hasJsonc = !!exists(jsonc);
  if (takeOver && hasJsonc) {
    if (!exists(jsonc).isFile()) fail(`Not a file: ${jsonc}`);
    backup('opencode.jsonc');
  }
  if (takeOver) {
    const plugins = path.join(target, 'plugins');
    safePath(plugins);
    const pluginStat = exists(plugins);
    if (pluginStat && !pluginStat.isDirectory()) fail(`Not a directory: ${plugins}`);
    if (pluginStat) for (const entry of fs.readdirSync(plugins, { withFileTypes: true })) {
      const name = `plugins/${entry.name}`;
      if (!validName(name) || entry.isSymbolicLink()) fail(`Unsafe plugin path: ${name}`);
      if (files.has(name) || [...files.keys()].some(file => file.startsWith(`${name}/`))) continue;
      if (entry.isDirectory() || (entry.isFile() && /\.(js|ts)$/.test(entry.name))) backup(name);
    }
  }
  for (const [name, data] of files) {
    const dest = path.join(target, ...name.split('/'));
    safePath(dest);
    const stat = exists(dest);
    let conflict = name === 'opencode.json' && hasJsonc && !keepLocal && !takeOver;
    if (stat && (!stat.isFile() || (Object.hasOwn(previous, name)
        ? hash(fs.readFileSync(dest)) !== previous[name]
        : name !== skillName || !originalSkill || !fs.readFileSync(dest).equals(originalSkill)))) conflict = true;
    if (conflict && takeOver) {
      if (stat && !stat.isFile()) fail(`Not a file: ${dest}`);
      conflict = false;
    }
    if (conflict) {
      conflicts.push(name);
      continue;
    }
    if (!stat || hash(fs.readFileSync(dest)) !== hash(data)) {
      writes.push([dest, data]);
      if (takeOver && stat) backup(name);
    }
    next[name] = hash(data);
  }
  const stale = [];
  for (const name of Object.keys(previous)) {
    if (files.has(name)) continue;
    const dest = path.join(target, ...name.split('/'));
    safePath(dest);
    const stat = exists(dest);
    if (!stat) {
      delete next[name];
      continue;
    }
    stale.push(name);
    if ((!stat.isFile() || hash(fs.readFileSync(dest)) !== previous[name]) && !takeOver) conflicts.push(name);
  }
  if (conflicts.length && !keepLocal) fail(`Local conflicts (use --keep-local to skip): ${conflicts.join(', ')}`);
  const manifestData = `${JSON.stringify({ version: 1, files: next }, null, 2)}\n`;
  const manifestChanged = !exists(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== manifestData;
  if (takeOver && manifestChanged && exists(manifestPath)) backup(manifestName);
  const provisionQuota = hasQuota && !conflicts.some(name => name === 'opencode.json' || name.startsWith('quota-desktop/'));
  const quotaDir = path.join(target, 'quota-desktop');
  const quotaModules = path.join(quotaDir, 'node_modules');
  const quotaMarker = path.join(quotaDir, '.installed');
  const quotaDigest = hasQuota && hash(Buffer.concat([files.get(quotaPackage), files.get(quotaLock)]));
  function needsQuota() {
    for (const item of [quotaModules, quotaMarker]) safePath(item);
    return !(exists(quotaMarker)?.isFile() && fs.readFileSync(quotaMarker, 'utf8') === quotaDigest &&
      ['@opencode/plugin', '@opentelemetry/api', 'jsonc-parser'].every(name => exists(path.join(quotaModules, name, 'package.json'))?.isFile()));
  }
  const provisionPlaywright = hasPlaywright && !conflicts.some(name => [packageName, lockName, 'opencode.json'].includes(name));
  const dir = path.join(target, 'playwright-mcp');
  const modules = path.join(dir, 'node_modules');
  const browsers = path.join(dir, 'browsers');
  const marker = path.join(dir, '.installed');
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers };
  const playwright = path.join(modules, 'playwright', 'cli.js');
  const digest = hasPlaywright && hash(Buffer.concat([files.get(packageName), files.get(lockName)]));
  function needsPlaywright() {
    for (const item of [modules, browsers, marker]) safePath(item);
    return !(exists(path.join(modules, '@playwright', 'mcp', 'cli.js')) && exists(playwright) && exists(marker)?.isFile() &&
      fs.readFileSync(marker, 'utf8') === digest &&
      spawnSync(process.execPath, ['-e', "const fs=require('node:fs');const p=require('playwright');process.exit(fs.existsSync(p.chromium.executablePath())?0:1)"], { cwd: dir, env, stdio: 'ignore' }).status === 0);
  }
  function npmCi(cwd, component, env) {
    const candidates = [
      process.env.npm_execpath,
      path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      ...((process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))),
      '/usr/share/nodejs/npm/bin/npm-cli.js'
    ].filter(Boolean);
    const npm = candidates.find(candidate => exists(candidate)?.isFile());
    if (!npm && process.platform === 'win32') fail('npm CLI not found; install Node.js with npm');
    const args = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
    const result = spawnSync(npm ? process.execPath : 'npm', npm ? [npm, ...args] : args, { cwd, env, stdio: 'ignore' });
    if (result.status !== 0) fail(`${component} provisioning failed (npm ci); check npm and network access, then rerun the installer`);
  }
  if (dryRun) {
    console.log(`Preview for ${target}:`);
    for (const name of backups.keys()) console.log(`  Back up: ${name}`);
    for (const [dest] of writes) console.log(`  Write: ${path.relative(target, dest)}`);
    if (manifestChanged) console.log(`  Write: ${manifestName}`);
    if (conflicts.length) console.log(`  Keep local: ${conflicts.join(', ')}`);
    if (stale.length) console.log(`  Obsolete managed files left in place: ${stale.join(', ')}`);
    if (provisionQuota && needsQuota()) console.log('  Ensure pinned Quota Desktop dependencies are installed');
    if (provisionPlaywright && needsPlaywright())
      console.log('  Ensure pinned Playwright MCP and Chromium are installed');
    return;
  }
  if (backups.size) {
    const parent = path.dirname(target);
    safePath(parent);
    const backupDir = fs.mkdtempSync(path.join(parent, `${path.basename(target)}-backup-`));
    fs.chmodSync(backupDir, 0o700);
    console.log(`Backup: ${backupDir} (restore files to ${target}; remove newly installed files as needed)`);
    for (const [name, original] of backups) {
      const source = path.join(target, ...name.split('/'));
      const dest = path.join(backupDir, ...name.split('/'));
      safePath(source);
      const current = exists(source);
      if (!current || current.dev !== original.dev || current.ino !== original.ino ||
          current.mtimeMs !== original.mtimeMs || current.size !== original.size) fail(`Path changed during install: ${source}; restore from ${backupDir}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      fs.renameSync(source, dest);
    }
  }
  fs.mkdirSync(target, { recursive: true });
  for (const [dest, data] of writes) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    writeAtomic(dest, data);
  }
  // Track successful file writes so failed provisioning can be retried normally.
  if (manifestChanged) writeAtomic(manifestPath, manifestData);
  if (provisionQuota && needsQuota()) {
    console.log('Installing pinned Quota Desktop dependencies...');
    npmCi(quotaDir, 'Quota Desktop');
    writeAtomic(quotaMarker, quotaDigest);
  }
  if (provisionPlaywright && needsPlaywright()) {
    console.log('Installing pinned Playwright MCP and Chromium...');
    npmCi(dir, 'Playwright', env);
    const result = spawnSync(process.execPath, [playwright, 'install', 'chromium'], { cwd: dir, env, stdio: 'ignore' });
    if (result.status !== 0) fail('Playwright provisioning failed (Chromium download); check npm and network access, then rerun the installer');
    writeAtomic(marker, digest);
  }
  console.log(`Installed ${writes.length} file(s) into ${target}${conflicts.length ? `; kept local: ${conflicts.join(', ')}` : ''}`);
  if (stale.length) console.log(`Obsolete managed files left in place; review and prune manually: ${stale.join(', ')}`);
}

try { install(); } catch (error) {
  console.error(`Install failed: ${error.message}`);
  process.exitCode = 1;
}
