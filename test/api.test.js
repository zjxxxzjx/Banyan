import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let child, base, dir, repoId;

const api = async (method, p, body) => {
  const resp = await fetch(base + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: resp.status, data: await resp.json().catch(() => ({})) };
};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-api-'));
  execFileSync('git', ['init', '-q', '-b', 'master'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'feat: init'], { cwd: dir });

  child = spawn(process.execPath, [path.join(root, 'server.js')], {
    env: { ...process.env, PORT: '7799' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server startup timeout')), 15000);
    child.stdout.on('data', (d) => {
      const m = String(d).match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); }
    });
    child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
});

after(() => {
  child?.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('settings endpoint responds', async () => {
  const r = await api('GET', '/api/settings');
  assert.equal(r.status, 200);
  assert.ok(typeof r.data === 'object');
});

test('repo register / status / log / branches', async () => {
  const add = await api('POST', '/api/repos', { path: dir });
  assert.equal(add.status, 200);
  repoId = add.data.id;
  const st = await api('GET', `/api/repos/${repoId}/status`);
  assert.equal(st.data.branch, 'master');
  const log = await api('GET', `/api/repos/${repoId}/log?limit=10`);
  assert.equal(log.data.length, 1);
  const br = await api('GET', `/api/repos/${repoId}/branches`);
  assert.ok(br.data.some((b) => b.name === 'master' && b.current));
});

test('stage + commit via API', async () => {
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x\ny\n');
  const stage = await api('POST', `/api/repos/${repoId}/stage`, { paths: ['f.txt'] });
  assert.equal(stage.status, 200);
  const commit = await api('POST', `/api/repos/${repoId}/commit`, { message: 'fix: y' });
  assert.equal(commit.status, 200);
  const log = await api('GET', `/api/repos/${repoId}/log?limit=10`);
  assert.equal(log.data[0].subject, 'fix: y');
});

test('validation errors are 400 with message', async () => {
  const r = await api('POST', `/api/repos/${repoId}/commit`, { message: '  ' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error);
});

test('ai-test rejects unreachable endpoint server-side', async () => {
  const r = await api('POST', '/api/ai-test', { aiBaseUrl: 'http://127.0.0.1:1/v1', aiModel: 'x' });
  assert.equal(r.status, 400);
  assert.ok(r.data.error);
});

test('repo removal', async () => {
  const r = await api('DELETE', `/api/repos/${repoId}`);
  assert.equal(r.status, 200);
  const list = await api('GET', '/api/repos');
  assert.ok(!list.data.some((x) => x.id === repoId));
});