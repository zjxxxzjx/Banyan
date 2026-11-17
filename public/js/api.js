async function request(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败 (${resp.status})`);
  return data;
}

export const api = {
  repos: () => request('GET', '/api/repos'),
  addRepo: (path) => request('POST', '/api/repos', { path }),
  removeRepo: (id) => request('DELETE', `/api/repos/${id}`),

  status: (id) => request('GET', `/api/repos/${id}/status`),
  diff: (id, { file, staged, untracked }) =>
    request('GET', `/api/repos/${id}/diff?file=${encodeURIComponent(file || '')}&staged=${staged ? 1 : 0}&untracked=${untracked ? 1 : 0}`),
  stage: (id, paths) => request('POST', `/api/repos/${id}/stage`, { paths }),
  unstage: (id, paths) => request('POST', `/api/repos/${id}/unstage`, { paths }),
  discard: (id, paths, untracked) => request('POST', `/api/repos/${id}/discard`, { paths, untracked, confirm: true }),
  commit: (id, message, amend) => request('POST', `/api/repos/${id}/commit`, { message, amend }),
  aiCommit: (id) => request('POST', `/api/repos/${id}/ai-commit`),

  log: (id, { limit = 200, skip = 0, all = true, branch = null }) =>
    request('GET', `/api/repos/${id}/log?limit=${limit}&skip=${skip}&all=${all ? 1 : 0}${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`),
  commitDetail: (id, sha) => request('GET', `/api/repos/${id}/commit/${sha}`),
  commitFileDiff: (id, sha, file) =>
    request('GET', `/api/repos/${id}/commit/${sha}/diff?file=${encodeURIComponent(file)}`),

  branches: (id) => request('GET', `/api/repos/${id}/branches`),
  createBranch: (id, name, from) => request('POST', `/api/repos/${id}/branches`, { name, from }),
  checkout: (id, name, detach) => request('POST', `/api/repos/${id}/checkout`, { name, detach }),
  deleteBranch: (id, name, { force, remote }) =>
    request('DELETE', `/api/repos/${id}/branches?name=${encodeURIComponent(name)}&force=${force ? 1 : 0}&remote=${remote ? 1 : 0}&confirm=${force ? 1 : 0}`),
  merge: (id, name) => request('POST', `/api/repos/${id}/merge`, { name }),
  rebase: (id, onto) => request('POST', `/api/repos/${id}/rebase`, { onto }),
  compare: (id, branch) => request('GET', `/api/repos/${id}/compare?branch=${encodeURIComponent(branch)}`),
  branchDiff: (id, branch, mode) =>
    request('GET', `/api/repos/${id}/branch-diff?branch=${encodeURIComponent(branch)}&mode=${mode}`),
  pushBranch: (id, name) => request('POST', `/api/repos/${id}/push-branch`, { name }),
  renameBranch: (id, oldName, newName) => request('POST', `/api/repos/${id}/rename-branch`, { oldName, newName }),
  remote: (id, op, strategy) => request('POST', `/api/repos/${id}/remote`, { op, strategy }),

  stashes: (id) => request('GET', `/api/repos/${id}/stash`),
  stashPush: (id, message, includeUntracked) => request('POST', `/api/repos/${id}/stash`, { message, includeUntracked }),
  stashOp: (id, op, ref) => request('POST', `/api/repos/${id}/stash-op`, { op, ref }),

  reflog: (id) => request('GET', `/api/repos/${id}/reflog`),
  undo: (id, sha) => request('POST', `/api/repos/${id}/undo`, { sha, confirm: true }),

  worktrees: (id) => request('GET', `/api/repos/${id}/worktrees`),
  addWorktree: (id, path, branch, newBranch, from) =>
    request('POST', `/api/repos/${id}/worktrees`, { path, branch, newBranch, from }),
  removeWorktree: (id, path, force) =>
    request('DELETE', `/api/repos/${id}/worktrees?path=${encodeURIComponent(path)}&force=${force ? 1 : 0}&confirm=1`),

  remotes: (id) => request('GET', `/api/repos/${id}/remotes`),
  identity: (id) => request('GET', `/api/repos/${id}/identity`),

  settings: () => request('GET', '/api/settings'),
  saveSettings: (patch) => request('PUT', '/api/settings', patch),
  fsList: (p) => request('GET', `/api/fs/list${p ? `?path=${encodeURIComponent(p)}` : ''}`),
};