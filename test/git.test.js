import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as G from '../lib/git.js';

let dir;
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
const write = (f, s) => fs.writeFileSync(path.join(dir, f), s);

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-test-'));
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 'test@banyan.fun');
  git('config', 'user.name', 'Banyan Test');
  write('a.txt', 'hello\n');
  git('add', '.');
  git('commit', '-qm', 'feat: base');
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('status reports clean tree and branch', async () => {
  const st = await G.getStatus(dir);
  assert.equal(st.branch, 'master');
  assert.deepEqual(st.files, []);
});

test('stage + commit + log with parents', async () => {
  write('a.txt', 'hello\nworld\n');
  await G.stage(dir, ['a.txt']);
  const st = await G.getStatus(dir);
  assert.equal(st.files.length, 1);
  await G.commit(dir, 'fix: extend a');
  const log = await G.getLog(dir, { all: false });
  assert.equal(log.length, 2);
  assert.equal(log[0].parents.length, 1);
  assert.equal(log[0].subject, 'fix: extend a');
});

test('branch create / checkout / merge / compare', async () => {
  await G.createBranch(dir, 'feature/x');
  await G.checkout(dir, 'feature/x');
  write('b.txt', 'b\n');
  await G.stage(dir, ['b.txt']);
  await G.commit(dir, 'feat: b');
  await G.checkout(dir, 'master');
  write('m.txt', 'm\n');
  await G.stage(dir, ['m.txt']);
  await G.commit(dir, 'chore: m');
  const branches = await G.getBranches(dir);
  assert.ok(branches.find((b) => b.name === 'master' && b.current));
  const cmpBefore = await G.compare(dir, 'feature/x');
  assert.equal(cmpBefore.ahead.length, 1);
  await G.mergeBranch(dir, 'feature/x');
  const log = await G.getLog(dir, { all: false });
  assert.equal(log[0].parents.length, 2);
  const cmpAfter = await G.compare(dir, 'feature/x');
  assert.equal(cmpAfter.ahead.length, 0);
});

test('rebase replays commits onto target', async () => {
  await G.checkout(dir, 'feature/x');
  write('c.txt', 'c\n');
  await G.stage(dir, ['c.txt']);
  await G.commit(dir, 'feat: c');
  const r = await G.rebase(dir, 'master');
  assert.equal(r.ok, true);
  const log = await G.getLog(dir, { all: false });
  assert.equal(log[0].subject, 'feat: c');
  assert.equal(log[0].parents.length, 1);
});

test('stash push / list / pop', async () => {
  write('a.txt', 'dirty\n');
  await G.stashPush(dir, 'wip', false);
  const stashes = await G.getStashes(dir);
  assert.equal(stashes.length, 1);
  const clean = await G.getStatus(dir);
  assert.deepEqual(clean.files, []);
  await G.stashOp(dir, 'pop', stashes[0].ref);
  const dirty = await G.getStatus(dir);
  assert.equal(dirty.files.length, 1);
  await G.discard(dir, ['a.txt'], []);
});

test('reflog records and undoTo restores', async () => {
  const log = await G.getLog(dir, { all: false });
  const target = log[1].sha;
  await G.undoTo(dir, target);
  const now = await G.getLog(dir, { all: false });
  assert.equal(now[0].sha, target);
  const reflog = await G.getReflog(dir);
  assert.ok(reflog.length > 0);
});

test('worktree add / list / remove', async () => {
  const wt = path.join(os.tmpdir(), `banyan-wt-${process.pid}`);
  await G.addWorktree(dir, wt, 'wt-branch', { newBranch: true, from: 'master' });
  const trees = await G.getWorktrees(dir);
  const wtReal = fs.realpathSync(wt);
  assert.ok(trees.some((t) => fs.realpathSync(t.path) === wtReal));
  await G.removeWorktree(dir, wt, false);
  const after = await G.getWorktrees(dir);
  assert.ok(!after.some((t) => fs.realpathSync(t.path) === wtReal));
  fs.rmSync(wt, { recursive: true, force: true });
});

test('identity reads git config', async () => {
  const id = await G.getIdentity(dir);
  assert.equal(id.name, 'Banyan Test');
  assert.equal(id.email, 'test@banyan.fun');
});