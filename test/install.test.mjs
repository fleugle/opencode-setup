import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../install.mjs', import.meta.url));
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-install-'));
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
