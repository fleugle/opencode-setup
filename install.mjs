#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const manifestName = '.opencode-setup-manifest.json';
const hash = data => createHash('sha256').update(data).digest('hex');
const exists = file => {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const fail = message => { throw new Error(message); };

// Reject links in every existing component, including ancestors of the target.
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
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keep-local') keepLocal = true;
    else if (args[i] === '--target' && args[i + 1] && !args[i + 1].startsWith('--')) target = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: node install.mjs [--target DIR] [--keep-local]\n--target DIR  Install into DIR instead of the global config directory.\n--keep-local  Skip conflicting local files and allow an existing opencode.jsonc overlay; use on every run with an overlay.');
      return;
    } else fail(`Unknown or incomplete option: ${args[i]}`);
  }
  target = path.resolve(target || process.env.OPENCODE_CONFIG_DIR ||
    path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'opencode'));
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
  const jsonc = path.join(target, 'opencode.jsonc');
  safePath(jsonc);
  const hasJsonc = !!exists(jsonc);
  for (const [name, data] of files) {
    const dest = path.join(target, ...name.split('/'));
    safePath(dest);
    const stat = exists(dest);
    let conflict = name === 'opencode.json' && hasJsonc && !keepLocal;
    if (stat && (!stat.isFile() || !Object.hasOwn(previous, name) ||
        hash(fs.readFileSync(dest)) !== previous[name])) conflict = true;
    if (conflict) {
      conflicts.push(name);
      continue;
    }
    if (!stat || hash(fs.readFileSync(dest)) !== hash(data)) writes.push([dest, data]);
    next[name] = hash(data);
  }
  const stale = Object.keys(previous).filter(name => !files.has(name));
  for (const name of stale) {
    const dest = path.join(target, ...name.split('/'));
    safePath(dest);
    const stat = exists(dest);
    if (stat && (!stat.isFile() || hash(fs.readFileSync(dest)) !== previous[name])) conflicts.push(name);
  }
  if (conflicts.length && !keepLocal) fail(`Local conflicts (use --keep-local to skip): ${conflicts.join(', ')}`);
  fs.mkdirSync(target, { recursive: true });
  for (const [dest, data] of writes) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    writeAtomic(dest, data);
  }
  const manifestData = `${JSON.stringify({ version: 1, files: next }, null, 2)}\n`;
  if (!exists(manifestPath) || fs.readFileSync(manifestPath, 'utf8') !== manifestData) writeAtomic(manifestPath, manifestData);
  console.log(`Installed ${writes.length} file(s) into ${target}${conflicts.length ? `; kept local: ${conflicts.join(', ')}` : ''}`);
  if (stale.length) console.log(`Obsolete managed files left in place; review and prune manually: ${stale.join(', ')}`);
}

try { install(); } catch (error) {
  console.error(`Install failed: ${error.message}`);
  process.exitCode = 1;
}
