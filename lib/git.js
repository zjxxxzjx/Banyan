import { execFile } from 'node:child_process';
import { t } from '../public/js/i18n.js';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const MAX_BUF = 64 * 1024 * 1024;

// 所有 git 调用走参数数组，杜绝 shell 注入
export async function git(cwd, args, { allowFail = false } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: MAX_BUF,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new GitError(t('仓库目录不存在或已被删除，请从列表移除后重新添加'), 1);
    }
    if (allowFail) {
      return { ok: false, stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
    }
    const msg = (e.stderr || e.stdout || e.message || '').toString().trim();
    throw new GitError(msg || t('git {0} 失败', args[0]), e.code ?? 1);
  }
}

export class GitError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export async function resolveRepo(inputPath) {
  const abs = path.resolve(inputPath);
  const st = await fs.stat(abs).catch(() => null);
  if (!st || !st.isDirectory()) throw new GitError(t('路径不存在或不是目录'));
  const r = await git(abs, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!r.ok) throw new GitError(t('该目录不是 Git 仓库'));
  return r.stdout.trim();
}

const FS = '\x1f';
const RS = '\x1e';

// git 会在每条记录后附加换行，统一清洗
function records(stdout) {
  return stdout.split(RS).map((r) => r.replace(/^\n/, '')).filter(Boolean);
}

export async function getStatus(cwd) {
  const r = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
  const tokens = r.stdout.split('\0');
  const info = { branch: null, oid: null, upstream: null, ahead: 0, behind: 0, files: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith('# branch.head ')) info.branch = t.slice(14) === '(detached)' ? null : t.slice(14);
    else if (t.startsWith('# branch.oid ')) info.oid = t.slice(13);
    else if (t.startsWith('# branch.upstream ')) info.upstream = t.slice(18);
    else if (t.startsWith('# branch.ab ')) {
      const m = t.slice(12).match(/\+(\d+) -(\d+)/);
      if (m) { info.ahead = +m[1]; info.behind = +m[2]; }
    } else if (t.startsWith('1 ') || t.startsWith('2 ') || t.startsWith('u ')) {
      const parts = t.split(' ');
      const kind = parts[0];
      const xy = parts[1];
      const file = {
        path: parts[kind === '2' ? 9 : kind === 'u' ? 10 : 8],
        x: xy[0], y: xy[1],
        conflicted: kind === 'u',
        renamed: kind === '2',
      };
      if (kind === '2') file.origPath = tokens[++i];
      info.files.push(file);
    } else if (t.startsWith('? ')) {
      info.files.push({ path: t.slice(2), x: '?', y: '?', untracked: true });
    }
  }
  info.detached = info.branch === null && info.oid && info.oid !== '(initial)';
  info.unborn = info.oid === '(initial)';
  return info;
}

export async function getDiff(cwd, { staged = false, file = null, untracked = false } = {}) {
  if (untracked && file) {
    const r = await git(cwd, ['diff', '--no-index', '--no-color', '--', '/dev/null', file], { allowFail: true });
    return r.stdout;
  }
  const args = ['diff', '--no-color', '--no-ext-diff'];
  if (staged) args.push('--cached');
  if (file) args.push('--', file);
  const r = await git(cwd, args);
  return r.stdout;
}

export async function stage(cwd, paths) {
  await git(cwd, ['add', '--', ...paths]);
}

export async function unstage(cwd, paths) {
  const head = await git(cwd, ['rev-parse', '--verify', 'HEAD'], { allowFail: true });
  if (head.ok) await git(cwd, ['reset', '-q', 'HEAD', '--', ...paths]);
  else await git(cwd, ['rm', '--cached', '-q', '--', ...paths]);
}

export async function discard(cwd, paths, untrackedPaths) {
  if (paths.length) await git(cwd, ['restore', '--worktree', '--', ...paths]);
  for (const p of untrackedPaths) {
    await fs.rm(path.join(cwd, p), { recursive: true, force: true });
  }
}

export async function commit(cwd, message, { amend = false } = {}) {
  const args = ['commit', '-m', message];
  if (amend) args.push('--amend');
  const r = await git(cwd, args, { allowFail: true });
  if (!r.ok) throw new GitError(r.stderr || r.stdout || t('提交失败'));
  return r.stdout;
}

export async function getLog(cwd, { limit = 200, skip = 0, all = true, branch = null } = {}) {
  const args = [
    'log', `--format=%H${FS}%P${FS}%an${FS}%at${FS}%s${FS}%D${RS}`,
    `-n${limit}`, `--skip=${skip}`, '--date-order',
  ];
  if (branch) args.push(branch);
  else if (all) args.push('--all');
  const r = await git(cwd, args, { allowFail: true });
  if (!r.ok && !r.stdout) return [];
  return records(r.stdout).map((rec) => {
    const [sha, parents, author, ts, subject, refs] = rec.split(FS);
    return {
      sha, parents: parents ? parents.split(' ') : [], author,
      time: +ts * 1000, subject,
      refs: refs ? refs.split(', ').map((s) => s.trim()).filter(Boolean) : [],
    };
  });
}

export async function getCommitDetail(cwd, sha) {
  const meta = await git(cwd, ['show', '-s', `--format=%H${FS}%P${FS}%an${FS}%ae${FS}%at${FS}%s${FS}%b${FS}%D`, sha]);
  const [fullSha, parents, author, email, ts, subject, body, refs] = meta.stdout.trim().split(FS);
  const parentList = parents ? parents.split(' ') : [];
  // 合并提交默认对第一父提交取差异，否则 diff-tree 无输出
  const files = parentList.length > 1
    ? await git(cwd, ['diff', '--name-status', `${sha}^1`, sha])
    : await git(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', sha]);
  const fileList = files.stdout.split('\n').filter(Boolean).map((line) => {
    const [st, ...rest] = line.split('\t');
    return { status: st[0], path: rest[rest.length - 1], origPath: st[0] === 'R' ? rest[0] : null };
  });
  return {
    sha: fullSha, parents: parentList, author, email,
    time: +ts * 1000, subject, body: body || '', refs: refs ? refs.split(', ').filter(Boolean) : [],
    files: fileList,
  };
}

export async function getCommitFileDiff(cwd, sha, file) {
  const pr = await git(cwd, ['rev-list', '--parents', '-n', '1', sha]);
  const isMerge = pr.stdout.trim().split(' ').length > 2;
  const args = isMerge
    ? ['diff', '--no-color', `${sha}^1`, sha, '--', file]
    : ['show', '--no-color', '--format=', sha, '--', file];
  const r = await git(cwd, args, { allowFail: true });
  return r.stdout;
}

export async function getBranches(cwd) {
  const fmt = `%(refname)${FS}%(objectname)${FS}%(upstream)${FS}%(upstream:track)${FS}%(committerdate:unix)${FS}%(HEAD)${RS}`;
  const r = await git(cwd, ['for-each-ref', `--format=${fmt}`, 'refs/heads', 'refs/remotes']);
  return records(r.stdout).map((rec) => {
    const [refname, sha, upstream, track, ts, head] = rec.split(FS);
    const remote = refname.startsWith('refs/remotes/');
    const name = refname.replace(/^refs\/(heads|remotes)\//, '');
    let ahead = 0, behind = 0, gone = false;
    const m = (track || '').match(/ahead (\d+)/); if (m) ahead = +m[1];
    const m2 = (track || '').match(/behind (\d+)/); if (m2) behind = +m2[1];
    gone = (track || '').includes('gone');
    return { name, sha, remote, upstream: upstream ? upstream.replace(/^refs\/remotes\//, '') : null, ahead, behind, gone, time: +ts * 1000, current: head === '*' };
  }).filter((b) => !b.name.endsWith('/HEAD'));
}

export async function rebase(cwd, onto) {
  return git(cwd, ['rebase', onto], { allowFail: true });
}

export async function compare(cwd, branch) {
  const [ahead, behind] = await Promise.all([
    getLog(cwd, { limit: 100, all: false, branch: `HEAD..${branch}` }),
    getLog(cwd, { limit: 100, all: false, branch: `${branch}..HEAD` }),
  ]);
  return { ahead, behind };
}

export async function branchDiff(cwd, branch, mode) {
  const args = mode === 'worktree' ? ['diff', branch] : ['diff', 'HEAD', branch];
  const r = await git(cwd, args, { allowFail: true });
  return r.stdout;
}

export async function pushBranch(cwd, name) {
  return git(cwd, ['push', '-u', 'origin', name], { allowFail: true });
}

export async function createBranch(cwd, name, from) {
  await git(cwd, ['branch', name, from || 'HEAD']);
}
export async function checkout(cwd, name, { detach = false } = {}) {
  const args = ['switch'];
  if (detach) args.push('--detach');
  args.push(name);
  const r = await git(cwd, args, { allowFail: true });
  if (!r.ok) throw new GitError(r.stderr || r.stdout);
  return r.stderr || r.stdout;
}
export async function deleteBranch(cwd, name, { force = false, remote = false } = {}) {
  if (remote) {
    const [remoteName, ...rest] = name.split('/');
    await git(cwd, ['push', remoteName, '--delete', rest.join('/')]);
  } else {
    await git(cwd, ['branch', force ? '-D' : '-d', name]);
  }
}
export async function mergeBranch(cwd, name) {
  const r = await git(cwd, ['merge', '--no-edit', name], { allowFail: true });
  return { ok: r.ok, output: (r.stdout + '\n' + r.stderr).trim() };
}
export async function renameBranch(cwd, oldName, newName) {
  await git(cwd, ['branch', '-m', oldName, newName]);
}

export async function remoteOp(cwd, op, { strategy = 'merge' } = {}) {
  let args;
  if (op === 'fetch') args = ['fetch', '--all', '--prune'];
  else if (op === 'pull') {
    args = ['pull', '--no-edit'];
    if (strategy === 'rebase') args.push('--rebase');
    else if (strategy === 'ff-only') args.push('--ff-only');
  } else if (op === 'push') {
    const st = await getStatus(cwd);
    args = ['push'];
    if (!st.upstream && st.branch) {
      const remotes = await git(cwd, ['remote']);
      const first = remotes.stdout.split('\n').filter(Boolean)[0];
      if (first) args.push('-u', first, st.branch);
    }
  } else throw new GitError(t('未知远程操作'));
  const r = await git(cwd, args, { allowFail: true });
  return { ok: r.ok, output: (r.stdout + '\n' + r.stderr).trim() };
}

export async function getStashes(cwd) {
  const r = await git(cwd, ['stash', 'list', `--format=%gd${FS}%s${FS}%at${RS}`], { allowFail: true });
  if (!r.ok) return [];
  return records(r.stdout).map((rec) => {
    const [ref, subject, ts] = rec.split(FS);
    return { ref, subject, time: +ts * 1000 };
  });
}
export async function stashPush(cwd, message, includeUntracked) {
  const args = ['stash', 'push'];
  if (message) args.push('-m', message);
  if (includeUntracked) args.push('--include-untracked');
  const r = await git(cwd, args, { allowFail: true });
  return { ok: r.ok, output: (r.stdout + r.stderr).trim() };
}
export async function stashOp(cwd, op, ref) {
  const r = await git(cwd, ['stash', op, ref], { allowFail: true });
  return { ok: r.ok, output: (r.stdout + '\n' + r.stderr).trim() };
}

export async function getReflog(cwd, limit = 100) {
  const r = await git(cwd, ['reflog', `--format=%H${FS}%gd${FS}%gs${FS}%at${RS}`, `-n${limit}`], { allowFail: true });
  if (!r.ok) return [];
  return records(r.stdout).map((rec) => {
    const [sha, ref, subject, ts] = rec.split(FS);
    return { sha, ref, subject, time: +ts * 1000 };
  });
}
export async function undoTo(cwd, sha) {
  // --keep 比 --hard 安全：会拒绝覆盖未提交的本地修改
  const r = await git(cwd, ['reset', '--keep', sha], { allowFail: true });
  if (!r.ok) throw new GitError(r.stderr || r.stdout);
}

export async function getWorktrees(cwd) {
  const r = await git(cwd, ['worktree', 'list', '--porcelain']);
  const trees = [];
  let cur = null;
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; trees.push(cur); }
    else if (line.startsWith('HEAD ') && cur) cur.sha = line.slice(5);
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === 'detached' && cur) cur.detached = true;
    else if (line === 'bare' && cur) cur.bare = true;
  }
  if (trees[0]) trees[0].main = true;
  return trees;
}
export async function addWorktree(cwd, wtPath, branch, { newBranch = false, from = 'HEAD' } = {}) {
  const args = ['worktree', 'add'];
  if (newBranch) args.push('-b', branch);
  args.push(wtPath);
  if (!newBranch) args.push(branch);
  else args.push(from);
  const r = await git(cwd, args, { allowFail: true });
  if (!r.ok) throw new GitError(r.stderr || r.stdout);
}
export async function removeWorktree(cwd, wtPath, force) {
  const args = ['worktree', 'remove', wtPath];
  if (force) args.push('--force');
  const r = await git(cwd, args, { allowFail: true });
  if (!r.ok) throw new GitError(r.stderr || r.stdout);
}

export async function getRemotes(cwd) {
  const r = await git(cwd, ['remote', '-v']);
  const map = {};
  for (const line of r.stdout.split('\n').filter(Boolean)) {
    const m = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)/);
    if (m) { map[m[1]] = map[m[1]] || {}; map[m[1]][m[3]] = m[2]; }
  }
  return Object.entries(map).map(([name, urls]) => ({ name, ...urls }));
}

export async function getIdentity(cwd) {
  const name = await git(cwd, ['config', 'user.name'], { allowFail: true });
  const email = await git(cwd, ['config', 'user.email'], { allowFail: true });
  return { name: name.stdout.trim(), email: email.stdout.trim() };
}