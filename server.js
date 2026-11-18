import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as G from './lib/git.js';
import * as store from './lib/store.js';
import { generateCommitMessage, testConnection } from './lib/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// TCC 挂起的 stat 会占用 libuv 线程池，加大池避免浏览目录时耗尽
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 7788);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2 * 1024 * 1024) throw new Error('请求体过大');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('请求体不是合法 JSON'); }
}

// 路由表：[方法, 路径正则, 处理器(req, res, params, query, body)]
const routes = [];
function route(method, pattern, handler) {
  routes.push([method, new RegExp(`^${pattern}$`), handler]);
}

async function withRepo(id, fn) {
  const repo = await store.getRepo(id);
  return fn(repo.path, repo);
}

route('GET', '/api/repos', async (req, res) => {
  // 不做阻塞式 stat：macOS TCC 授权弹窗期间列表也要能立即返回
  const repos = await store.listRepos();
  json(res, 200, repos.map((r) => ({ ...r, valid: true })));
});

route('POST', '/api/repos', async (req, res, p, q, body) => {
  if (!body.path) throw new Error('缺少 path');
  const top = await G.resolveRepo(body.path);
  const repo = await store.addRepo(top, path.basename(top));
  json(res, 200, repo);
});

route('DELETE', '/api/repos/([^/]+)', async (req, res, p) => {
  await store.removeRepo(p[0]);
  json(res, 200, { ok: true });
});

route('GET', '/api/repos/([^/]+)/status', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getStatus(cwd)));
});

route('GET', '/api/repos/([^/]+)/diff', async (req, res, p, q) => {
  const text = await withRepo(p[0], (cwd) => G.getDiff(cwd, {
    staged: q.get('staged') === '1',
    file: q.get('file') || null,
    untracked: q.get('untracked') === '1',
  }));
  json(res, 200, { diff: text });
});

route('POST', '/api/repos/([^/]+)/stage', async (req, res, p, q, body) => {
  await withRepo(p[0], (cwd) => G.stage(cwd, body.paths || []));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/unstage', async (req, res, p, q, body) => {
  await withRepo(p[0], (cwd) => G.unstage(cwd, body.paths || []));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/discard', async (req, res, p, q, body) => {
  if (body.confirm !== true) throw new Error('丢弃更改需要确认');
  await withRepo(p[0], (cwd) => G.discard(cwd, body.paths || [], body.untracked || []));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/commit', async (req, res, p, q, body) => {
  if (!body.message || !body.message.trim()) throw new Error('提交信息不能为空');
  const out = await withRepo(p[0], (cwd) => G.commit(cwd, body.message.trim(), { amend: !!body.amend }));
  json(res, 200, { ok: true, output: out });
});

route('GET', '/api/repos/([^/]+)/log', async (req, res, p, q) => {
  const commits = await withRepo(p[0], (cwd) => G.getLog(cwd, {
    limit: Math.min(Number(q.get('limit')) || 200, 1000),
    skip: Number(q.get('skip')) || 0,
    all: q.get('all') !== '0',
    branch: q.get('branch') || null,
  }));
  json(res, 200, commits);
});

route('GET', '/api/repos/([^/]+)/commit/([0-9a-f]{7,40})', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getCommitDetail(cwd, p[1])));
});

route('GET', '/api/repos/([^/]+)/commit/([0-9a-f]{7,40})/diff', async (req, res, p, q) => {
  const text = await withRepo(p[0], (cwd) => G.getCommitFileDiff(cwd, p[1], q.get('file') || ''));
  json(res, 200, { diff: text });
});

route('GET', '/api/repos/([^/]+)/branches', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getBranches(cwd)));
});

route('POST', '/api/repos/([^/]+)/branches', async (req, res, p, q, body) => {
  if (!body.name) throw new Error('缺少分支名');
  await withRepo(p[0], (cwd) => G.createBranch(cwd, body.name, body.from));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/checkout', async (req, res, p, q, body) => {
  const out = await withRepo(p[0], (cwd) => G.checkout(cwd, body.name, { detach: !!body.detach }));
  json(res, 200, { ok: true, output: out });
});

route('DELETE', '/api/repos/([^/]+)/branches', async (req, res, p, q) => {
  const force = q.get('force') === '1';
  const remote = q.get('remote') === '1';
  if (force && q.get('confirm') !== '1') throw new Error('强制删除需要确认');
  await withRepo(p[0], (cwd) => G.deleteBranch(cwd, q.get('name'), { force, remote }));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/merge', async (req, res, p, q, body) => {
  const r = await withRepo(p[0], (cwd) => G.mergeBranch(cwd, body.name));
  json(res, 200, r);
});

route('POST', '/api/repos/([^/]+)/rename-branch', async (req, res, p, q, body) => {
  await withRepo(p[0], (cwd) => G.renameBranch(cwd, body.oldName, body.newName));
  json(res, 200, { ok: true });
});

route('POST', '/api/repos/([^/]+)/remote', async (req, res, p, q, body) => {
  const r = await withRepo(p[0], (cwd) => G.remoteOp(cwd, body.op, { strategy: body.strategy }));
  json(res, 200, r);
});

route('GET', '/api/repos/([^/]+)/stash', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getStashes(cwd)));
});

route('POST', '/api/repos/([^/]+)/stash', async (req, res, p, q, body) => {
  const r = await withRepo(p[0], (cwd) => G.stashPush(cwd, body.message, !!body.includeUntracked));
  json(res, 200, r);
});

route('POST', '/api/repos/([^/]+)/stash-op', async (req, res, p, q, body) => {
  const r = await withRepo(p[0], (cwd) => G.stashOp(cwd, body.op, body.ref));
  json(res, 200, r);
});

route('POST', '/api/repos/([^/]+)/rebase', async (req, res, p, q, body) => {
  if (!body.onto) throw new Error('缺少变基目标');
  const r = await withRepo(p[0], (cwd) => G.rebase(cwd, body.onto));
  json(res, 200, { ok: r.ok, output: r.stdout + r.stderr });
});

route('GET', '/api/repos/([^/]+)/compare', async (req, res, p, q) => {
  const branch = q.get('branch');
  if (!branch) throw new Error('缺少分支名');
  json(res, 200, await withRepo(p[0], (cwd) => G.compare(cwd, branch)));
});

route('GET', '/api/repos/([^/]+)/branch-diff', async (req, res, p, q) => {
  const branch = q.get('branch');
  if (!branch) throw new Error('缺少分支名');
  const diff = await withRepo(p[0], (cwd) => G.branchDiff(cwd, branch, q.get('mode') || 'compare'));
  json(res, 200, { diff });
});

route('POST', '/api/repos/([^/]+)/push-branch', async (req, res, p, q, body) => {
  if (!body.name) throw new Error('缺少分支名');
  const r = await withRepo(p[0], (cwd) => G.pushBranch(cwd, body.name));
  json(res, 200, { ok: r.ok, output: r.stdout + r.stderr });
});

route('POST', '/api/ai-test', async (req, res, p, q, body) => {
  json(res, 200, await testConnection(body || {}));
});

route('GET', '/api/repos/([^/]+)/reflog', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getReflog(cwd)));
});

route('POST', '/api/repos/([^/]+)/undo', async (req, res, p, q, body) => {
  if (body.confirm !== true) throw new Error('回退操作需要确认');
  await withRepo(p[0], (cwd) => G.undoTo(cwd, body.sha));
  json(res, 200, { ok: true });
});

route('GET', '/api/repos/([^/]+)/worktrees', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getWorktrees(cwd)));
});

route('POST', '/api/repos/([^/]+)/worktrees', async (req, res, p, q, body) => {
  if (!body.path || !body.branch) throw new Error('缺少路径或分支');
  await withRepo(p[0], (cwd) => G.addWorktree(cwd, body.path, body.branch, { newBranch: !!body.newBranch, from: body.from }));
  json(res, 200, { ok: true });
});

route('DELETE', '/api/repos/([^/]+)/worktrees', async (req, res, p, q) => {
  if (q.get('confirm') !== '1') throw new Error('移除工作区需要确认');
  await withRepo(p[0], (cwd) => G.removeWorktree(cwd, q.get('path'), q.get('force') === '1'));
  json(res, 200, { ok: true });
});

route('GET', '/api/repos/([^/]+)/remotes', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getRemotes(cwd)));
});

route('GET', '/api/repos/([^/]+)/identity', async (req, res, p) => {
  json(res, 200, await withRepo(p[0], (cwd) => G.getIdentity(cwd)));
});

route('POST', '/api/repos/([^/]+)/ai-commit', async (req, res, p) => {
  const message = await withRepo(p[0], (cwd) => generateCommitMessage(cwd));
  json(res, 200, { message });
});

route('GET', '/api/settings', async (req, res) => {
  json(res, 200, await store.getSettings());
});

// 本机文件夹浏览：仅列目录，标记 git 仓库
route('GET', '/api/fs/list', async (req, res, p, q) => {
  const home = os.homedir();
  const target = path.resolve(q.get('path') || home);
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('目录不存在');
    if (e.code === 'EACCES' || e.code === 'EPERM') throw new Error('无权限访问该目录（macOS 隐私授权可能未允许）');
    throw e;
  }
  const names = entries.filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).map((e) => e.name).sort();
  // .git / 符号链接探测可能被 macOS TCC 授权挂起：超时即放弃，不阻塞浏览
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const dirs = (await Promise.all(names.map(async (name) => {
    const full = path.join(target, name);
    const st = await withTimeout(fs.stat(full).catch(() => null), 250);
    if (!st || !st.isDirectory()) return null;
    const git = await withTimeout(fs.stat(path.join(full, '.git')).catch(() => null), 250);
    return { name, path: full, isRepo: !!git };
  }))).filter(Boolean);
  const parent = path.dirname(target);
  json(res, 200, { path: target, parent: parent === target ? null : parent, home, dirs });
});

route('PUT', '/api/settings', async (req, res, p, q, body) => {
  const allowed = ['theme', 'aiBaseUrl', 'aiApiKey', 'aiModel', 'logAll'];
  const patch = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  json(res, 200, await store.saveSettings(patch));
});

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${HOST}`);
  try {
    if (u.pathname.startsWith('/api/')) {
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      for (const [method, re, handler] of routes) {
        if (method !== req.method) continue;
        const m = u.pathname.match(re);
        if (m) {
          await handler(req, res, m.slice(1), u.searchParams, body);
          return;
        }
      }
      json(res, 404, { error: '接口不存在' });
      return;
    }
    await serveStatic(req, res, u.pathname);
  } catch (e) {
    json(res, e instanceof G.GitError ? 400 : 500, { error: e.message || '服务器内部错误' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Banyan Git 客户端已启动: http://${HOST}:${PORT}`);
});