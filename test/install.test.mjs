import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const installer = fileURLToPath(new URL('../install.mjs', import.meta.url));

test('renders absolute Playwright paths and previews without provisioning', t => {
  const f = fixture(t);
  const shipped = fileURLToPath(new URL('../payload/', import.meta.url));
  fs.copyFileSync(path.join(shipped, 'opencode.json'), path.join(f.payload, 'opencode.json'));
  fs.cpSync(path.join(shipped, 'playwright-mcp'), path.join(f.payload, 'playwright-mcp'), { recursive: true });
  const preview = f.run('--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Ensure pinned Playwright MCP and Chromium/);
  assert.equal(fs.existsSync(f.target), false);

  const dir = path.join(f.target, 'playwright-mcp');
  const modules = path.join(dir, 'node_modules');
  fs.mkdirSync(path.join(modules, '@playwright', 'mcp'), { recursive: true });
  fs.mkdirSync(path.join(modules, 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(modules, '@playwright', 'mcp', 'cli.js'), '');
  fs.writeFileSync(path.join(modules, 'playwright', 'cli.js'), '');
  fs.writeFileSync(path.join(modules, 'playwright', 'index.js'), "exports.chromium={executablePath:()=>process.execPath}");
  const digest = createHash('sha256').update(fs.readFileSync(path.join(f.payload, 'playwright-mcp', 'package.json')))
    .update(fs.readFileSync(path.join(f.payload, 'playwright-mcp', 'package-lock.json'))).digest('hex');
  fs.writeFileSync(path.join(dir, '.installed'), digest);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const server = JSON.parse(fs.readFileSync(path.join(f.target, 'opencode.json'))).mcp.servers.playwright;
  assert.deepEqual(server.command, [process.execPath, path.join(modules, '@playwright', 'mcp', 'cli.js'), '--browser', 'chromium', '--isolated', '--caps', 'vision,pdf,devtools']);
  assert.equal(server.environment.PLAYWRIGHT_BROWSERS_PATH, path.join(dir, 'browsers'));
  assert.doesNotMatch(f.run().stdout, /Installing pinned/);
  const healthy = f.run('--dry-run');
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.doesNotMatch(healthy.stdout, /Ensure pinned Playwright/);
  fs.unlinkSync(path.join(modules, 'playwright', 'cli.js'));
  const missing = f.run('--dry-run');
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /Ensure pinned Playwright MCP and Chromium/);
  assert.equal(fs.existsSync(path.join(modules, 'playwright', 'cli.js')), false);
  assert.equal(fs.readFileSync(path.join(dir, '.installed'), 'utf8'), digest);
  fs.writeFileSync(path.join(dir, 'package.json'), 'local');
  const conflict = f.run('--dry-run', '--keep-local');
  assert.equal(conflict.status, 0, conflict.stderr);
  assert.match(conflict.stdout, /Keep local:.*playwright-mcp\/package.json/);
  assert.doesNotMatch(conflict.stdout, /Ensure pinned Playwright/);
});

test('provisions through the discovered npm CLI and skips unchanged installs', t => {
  const f = fixture(t);
  const shipped = fileURLToPath(new URL('../payload/', import.meta.url));
  fs.copyFileSync(path.join(shipped, 'opencode.json'), path.join(f.payload, 'opencode.json'));
  fs.cpSync(path.join(shipped, 'playwright-mcp'), path.join(f.payload, 'playwright-mcp'), { recursive: true });
  const fakeNpm = path.join(f.root, 'fake-npm.js');
  fs.writeFileSync(fakeNpm, `
    const fs = require('node:fs');
    fs.appendFileSync(${JSON.stringify(path.join(f.root, 'calls'))}, process.argv.slice(2).join(' ') + '\\n');
    fs.mkdirSync('node_modules/@playwright/mcp', {recursive:true});
    fs.mkdirSync('node_modules/playwright', {recursive:true});
    fs.writeFileSync('node_modules/@playwright/mcp/cli.js', '');
    fs.writeFileSync('node_modules/playwright/index.js', "exports.chromium={executablePath:()=>process.execPath}");
    fs.writeFileSync('node_modules/playwright/cli.js', "require('node:fs').appendFileSync(" + JSON.stringify(${JSON.stringify(path.join(f.root, 'calls'))}) + ", process.argv.slice(2).join(' ') + '\\\\n')");
  `);
  const run = (...args) => spawnSync(process.execPath, [path.join(f.source, 'install.mjs'), '--target', f.target, ...args], {
    encoding: 'utf8', env: { ...process.env, npm_execpath: fakeNpm }
  });
  assert.equal(run('--dry-run').status, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'calls')), false);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(fs.readFileSync(path.join(f.root, 'calls'), 'utf8'), /^ci --ignore-scripts --no-audit --no-fund\ninstall chromium\n$/);
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stdout, /Installing pinned/);
});
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'opencode-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const payload = path.join(source, 'payload');
  const target = path.join(root, 'target');
  fs.mkdirSync(payload, { recursive: true });
  fs.copyFileSync(installer, path.join(source, 'install.mjs'));
  fs.writeFileSync(path.join(payload, 'opencode.json'), '{"version":1}');
  fs.mkdirSync(path.join(payload, 'agents'));
  fs.writeFileSync(path.join(payload, 'agents', 'example.md'), 'one');
  const run = (...args) => spawnSync(process.execPath, [path.join(source, 'install.mjs'), '--target', target, ...args], { encoding: 'utf8' });
  return { root, source, payload, target, run };
}

test('accepts a linked parent but rejects a linked config root', t => {
  const f = fixture(t);
  const realParent = path.join(f.root, 'real-parent');
  const linkedParent = path.join(f.root, 'linked-parent');
  fs.mkdirSync(realParent);
  try { fs.symlinkSync(realParent, linkedParent, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'ENOSYS'].includes(error.code)) return t.skip('directory links unavailable');
    throw error;
  }
  const run = target => spawnSync(process.execPath, [path.join(f.source, 'install.mjs'), '--target', target], { encoding: 'utf8' });
  const result = run(path.join(linkedParent, 'nested', 'opencode'));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(realParent, 'nested', 'opencode', 'opencode.json')));
  assert.match(run(linkedParent).stderr, /Unsafe symlink/);
});

test('repeat and update managed files without touching unmanaged files', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.target, 'service.json'), 'private');
  assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.payload, 'agents', 'example.md'), 'two');
  assert.equal(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'agents', 'example.md'), 'utf8'), 'two');
  assert.equal(fs.readFileSync(path.join(f.target, 'service.json'), 'utf8'), 'private');
});

test('preflight prevents partial writes; keep-local skips edited files', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.target, 'agents', 'example.md'), 'local');
  fs.writeFileSync(path.join(f.payload, 'opencode.json'), '{"version":2}');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.json'), 'utf8'), '{"version":1}');
  assert.equal(f.run('--keep-local').status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'agents', 'example.md'), 'utf8'), 'local');
  assert.notEqual(f.run().status, 0);
});

test('existing jsonc and unrecognized files are protected', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.target, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(f.target, 'opencode.jsonc'), '// local');
  fs.writeFileSync(path.join(f.target, 'agents', 'example.md'), 'local');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.existsSync(path.join(f.target, '.opencode-setup-manifest.json')), false);
  assert.equal(f.run('--keep-local').status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.json'), 'utf8'), '{"version":1}');
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.jsonc'), 'utf8'), '// local');
  assert.equal(fs.readFileSync(path.join(f.target, 'agents', 'example.md'), 'utf8'), 'local');
  fs.writeFileSync(path.join(f.payload, 'opencode.json'), '{"version":2}');
  assert.equal(f.run('--keep-local').status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.json'), 'utf8'), '{"version":2}');
});

test('reports obsolete files without deleting them and preflights edited obsolete files', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const stale = path.join(f.target, 'agents', 'example.md');
  fs.unlinkSync(path.join(f.payload, 'agents', 'example.md'));
  let result = f.run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /review and prune manually: agents\/example\.md/);
  assert.equal(fs.readFileSync(stale, 'utf8'), 'one');
  fs.writeFileSync(stale, 'local');
  fs.writeFileSync(path.join(f.payload, 'opencode.json'), '{"version":2}');
  result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.json'), 'utf8'), '{"version":1}');
  result = f.run('--keep-local');
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(stale, 'utf8'), 'local');
});

test('forgets absent obsolete files only when applied', t => {
  const f = fixture(t);
  const name = 'EDGE-SETUP.md';
  const shipped = path.join(f.payload, name);
  const installed = path.join(f.target, name);
  const manifest = path.join(f.target, '.opencode-setup-manifest.json');
  fs.writeFileSync(shipped, 'obsolete');
  assert.equal(f.run().status, 0);
  fs.unlinkSync(shipped);
  fs.unlinkSync(installed);
  const before = fs.readFileSync(manifest, 'utf8');
  const expected = JSON.parse(before);
  assert.ok(Object.hasOwn(expected.files, name));
  delete expected.files[name];

  const preview = f.run('--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(preview.stdout.trimEnd().split(/\r?\n/).slice(1), [`  Write: ${path.basename(manifest)}`]);
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Installed 0 file\(s\)/);
  assert.doesNotMatch(result.stdout, /Obsolete managed files/);
  assert.equal(fs.existsSync(installed), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest, 'utf8')), expected);

  const old = new Date('2001-01-01T00:00:00Z');
  fs.utimesSync(manifest, old, old);
  assert.equal(f.run().status, 0);
  assert.equal(fs.statSync(manifest).mtimeMs, old.getTime());
});

test('does not rewrite unchanged files or manifest', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const config = path.join(f.target, 'opencode.json');
  const manifest = path.join(f.target, '.opencode-setup-manifest.json');
  const old = new Date('2001-01-01T00:00:00Z');
  fs.utimesSync(config, old, old);
  fs.utimesSync(manifest, old, old);
  assert.equal(f.run().status, 0);
  assert.equal(fs.statSync(config).mtimeMs, old.getTime());
  assert.equal(fs.statSync(manifest).mtimeMs, old.getTime());
});

test('renders and updates machine-local skill metadata without trusting path text', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'source with spaces');
  fs.renameSync(f.source, source);
  const skill = 'skills/opencode-setup/SKILL.md';
  const template = fs.readFileSync(new URL(`../payload/${skill}`, import.meta.url));
  const shipped = path.join(source, 'payload', ...skill.split('/'));
  const installed = path.join(f.target, ...skill.split('/'));
  fs.mkdirSync(path.dirname(shipped), { recursive: true });
  fs.writeFileSync(shipped, template);
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.writeFileSync(installed, template);
  const run = dir => spawnSync(process.execPath, [path.join(dir, 'install.mjs'), '--target', f.target], { encoding: 'utf8' });
  let result = run(source);
  assert.equal(result.status, 0, result.stderr);
  const first = fs.readFileSync(installed, 'utf8');
  assert.match(first, new RegExp(`Node platform: ${process.platform}`));
  assert.ok(first.includes(Buffer.from(source).toString('base64')));
  const encodedTarget = first.match(/Installed config path \(UTF-8, base64\): (.+)/)[1];
  assert.equal(Buffer.from(encodedTarget, 'base64').toString('utf8'), fs.realpathSync(f.target));
  assert.ok(!first.includes(source));
  const old = new Date('2001-01-01T00:00:00Z');
  fs.utimesSync(installed, old, old);
  assert.equal(run(source).status, 0);
  assert.equal(fs.statSync(installed).mtimeMs, old.getTime());
  const moved = path.join(f.root, 'moved checkout');
  fs.renameSync(source, moved);
  result = run(moved);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(installed, 'utf8').includes(Buffer.from(moved).toString('base64')));
  fs.appendFileSync(installed, '\nlocal edit');
  assert.notEqual(run(moved).status, 0);
});

test('does not adopt a modified unmanaged setup skill', t => {
  const f = fixture(t);
  const skill = 'skills/opencode-setup/SKILL.md';
  const shipped = path.join(f.payload, ...skill.split('/'));
  const installed = path.join(f.target, ...skill.split('/'));
  fs.mkdirSync(path.dirname(shipped), { recursive: true });
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.writeFileSync(shipped, 'template');
  fs.writeFileSync(installed, 'local');
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(installed, 'utf8'), 'local');
});

test('rejects symlink destinations and reserved payload files', t => {
  const f = fixture(t);
  fs.mkdirSync(f.target);
  try { fs.symlinkSync(f.root, path.join(f.target, 'agents'), 'junction'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) return t.skip('Symlinks unavailable');
    throw error;
  }
  assert.notEqual(f.run('--keep-local').status, 0);
  assert.equal(fs.existsSync(path.join(f.target, 'opencode.json')), false);
  fs.rmSync(path.join(f.target, 'agents'));
  fs.writeFileSync(path.join(f.payload, 'service.json'), '{}');
  assert.notEqual(f.run().status, 0);
});

test('takeover previews and backs up conflicts and discovered plugins without touching private files', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.target, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(f.target, 'plugins', 'extra'), { recursive: true });
  fs.writeFileSync(path.join(f.target, 'opencode.json'), 'old config');
  fs.writeFileSync(path.join(f.target, 'opencode.jsonc'), 'legacy secret');
  fs.writeFileSync(path.join(f.target, 'agents', 'example.md'), 'local agent');
  fs.writeFileSync(path.join(f.target, 'plugins', 'extra', 'index.js'), 'plugin');
  fs.writeFileSync(path.join(f.target, 'plugins', 'extra.ts'), 'plugin file');
  fs.writeFileSync(path.join(f.target, 'plugins', 'notes.txt'), 'notes');
  for (const name of ['service.json', 'auth.json', 'state.db']) fs.writeFileSync(path.join(f.target, name), 'private');
  const preview = f.run('--take-over', '--dry-run');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Back up: opencode.jsonc/);
  assert.doesNotMatch(preview.stdout, /legacy secret/);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.json'), 'utf8'), 'old config');
  assert.equal(fs.existsSync(path.join(f.target, '.opencode-setup-manifest.json')), false);
  assert.deepEqual(fs.readdirSync(f.root).sort(), ['source', 'target']);
  assert.notEqual(f.run('--take-over', '--keep-local').status, 0);
  const result = f.run('--take-over');
  assert.equal(result.status, 0, result.stderr);
  const backup = path.join(f.root, fs.readdirSync(f.root).find(name => name.startsWith('target-backup-')));
  assert.match(result.stdout, /Backup:/);
  assert.equal(fs.readFileSync(path.join(backup, 'opencode.jsonc'), 'utf8'), 'legacy secret');
  assert.equal(fs.readFileSync(path.join(backup, 'opencode.json'), 'utf8'), 'old config');
  assert.equal(fs.readFileSync(path.join(backup, 'agents', 'example.md'), 'utf8'), 'local agent');
  assert.equal(fs.readFileSync(path.join(backup, 'plugins', 'extra', 'index.js'), 'utf8'), 'plugin');
  assert.equal(fs.readFileSync(path.join(backup, 'plugins', 'extra.ts'), 'utf8'), 'plugin file');
  assert.equal(fs.existsSync(path.join(f.target, 'opencode.jsonc')), false);
  assert.equal(fs.readFileSync(path.join(f.target, 'plugins', 'notes.txt'), 'utf8'), 'notes');
  for (const name of ['service.json', 'auth.json', 'state.db']) assert.equal(fs.readFileSync(path.join(f.target, name), 'utf8'), 'private');
  assert.equal(f.run().status, 0);
});

test('takeover backs up edited managed files and the old manifest', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  fs.writeFileSync(path.join(f.target, 'agents', 'example.md'), 'edited');
  fs.writeFileSync(path.join(f.payload, 'opencode.json'), 'new');
  const result = f.run('--take-over');
  assert.equal(result.status, 0, result.stderr);
  const backup = path.join(f.root, fs.readdirSync(f.root).find(name => name.startsWith('target-backup-')));
  assert.equal(fs.readFileSync(path.join(backup, 'agents', 'example.md'), 'utf8'), 'edited');
  assert.equal(fs.readFileSync(path.join(backup, 'opencode.json'), 'utf8'), '{"version":1}');
  assert.ok(fs.existsSync(path.join(backup, '.opencode-setup-manifest.json')));
  assert.equal(f.run().status, 0);
});

test('takeover preflights unsupported conflicting directories', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.target, 'agents', 'example.md'), { recursive: true });
  fs.writeFileSync(path.join(f.target, 'opencode.jsonc'), 'legacy');
  assert.notEqual(f.run('--take-over').status, 0);
  assert.equal(fs.readFileSync(path.join(f.target, 'opencode.jsonc'), 'utf8'), 'legacy');
  assert.deepEqual(fs.readdirSync(f.root).sort(), ['source', 'target']);
});
