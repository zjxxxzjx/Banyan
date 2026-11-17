import { api } from './api.js';
import { esc, toast, promptModal, confirmModal, outputModal, pill, modal } from './util.js';
import { icon, logoMark } from './icons.js';
import * as changes from './views/changes.js';
import * as history from './views/history.js';
import * as stash from './views/stash.js';
import * as worktrees from './views/worktrees.js';
import * as reflog from './views/reflog.js';
import * as settings from './views/settings.js';

const VIEWS = {
  changes: { mod: changes, icon: 'commit', label: '变更' },
  history: { mod: history, icon: 'branch', label: '分支' },
  stash: { mod: stash, icon: 'archive', label: '贮藏' },
  worktrees: { mod: worktrees, icon: 'layers', label: '工作区' },
  reflog: { mod: reflog, icon: 'clock', label: '日志' },
  settings: { mod: settings, icon: 'settings', label: '设置' },
};

const state = {
  repos: [], repoId: null, view: 'changes',
  status: null, branches: [], remotes: [], identity: null,
  log: [], logAll: true, logLimit: 200, logSkip: 0, logFilter: '', logBranch: null, treeCollapsed: [],
  selectedFile: null, diffText: '',
  selectedCommit: null, commitDetail: null, commitFile: null, commitDiffText: '',
  stashes: [], worktrees: [], reflog: [],
  settings: {}, commitMsg: '', amend: false,
  busy: {},
};

const $ = (sel) => document.querySelector(sel);

function currentRepo() {
  return state.repos.find((r) => r.id === state.repoId);
}

// ---------- 数据加载 ----------
async function loadRepos() {
  state.repos = await api.repos();
}

async function loadCore() {
  const id = state.repoId;
  const [status, branches, remotes, identity] = await Promise.all([
    api.status(id), api.branches(id), api.remotes(id), api.identity(id),
  ]);
  state.status = status;
  state.branches = branches;
  state.remotes = remotes;
  state.identity = identity;
}

async function loadLog() {
  state.log = await api.log(state.repoId, { limit: state.logLimit, skip: 0, all: state.logAll, branch: state.logBranch });
  state.logSkip = 0;
}

async function loadViewData() {
  const id = state.repoId;
  if (state.view === 'history') await loadLog();
  else if (state.view === 'stash') state.stashes = await api.stashes(id);
  else if (state.view === 'worktrees') state.worktrees = await api.worktrees(id);
  else if (state.view === 'reflog') state.reflog = await api.reflog(id);
}

async function fetchSelectedDiff() {
  const sel = state.selectedFile;
  if (!sel) { state.diffText = ''; return; }
  const st = state.status;
  const exists = st.files.some((f) => f.path === sel.path && (sel.untracked ? f.untracked : sel.staged ? f.x !== '.' : (f.y !== '.' || f.untracked)));
  if (!exists) {
    // 暂存状态变化后尝试另一侧
    const other = st.files.find((f) => f.path === sel.path);
    if (other) {
      sel.staged = !sel.untracked && other.x !== '.' && !other.untracked;
      sel.untracked = !!other.untracked;
    } else {
      state.selectedFile = null; state.diffText = ''; return;
    }
  }
  state.busy.diff = true;
  try {
    const { diff } = await api.diff(state.repoId, { file: sel.path, staged: sel.staged, untracked: sel.untracked });
    state.diffText = diff;
  } catch (err) {
    state.diffText = '';
    toast(err.message, 'error');
  }
  state.busy.diff = false;
}

async function refresh() {
  if (!state.repoId) { renderAll(); return; }
  try {
    await loadCore();
    await loadViewData();
    if (state.view === 'changes') await fetchSelectedDiff();
  } catch (err) {
    // 仓库被外部删除/移动时自动回落，避免界面卡在失效 id 上
    if (/仓库不存在/.test(err.message)) {
      await loadRepos();
      const next = state.repos.find((r) => r.valid);
      state.repoId = next ? next.id : null;
      state.status = null; state.log = [];
      renderAll();
      if (next) refresh();
      return;
    }
    toast(err.message, 'error');
  }
  renderAll();
}

// ---------- 交互动作 ----------
const ctx = {
  state,
  refresh,
  loadRepos,
  loadLog,
  loadViewData,
  renderAll,
  selectRepo(id) {
    if (state.repoId === id) return;
    state.repoId = id;
    state.selectedFile = null; state.diffText = '';
    state.selectedCommit = null; state.commitDetail = null; state.commitFile = null;
    state.log = []; state.logFilter = ''; state.logBranch = null;
    state.commitMsg = ''; state.amend = false;
    state.status = null;
    renderAll();
    refresh();
  },
  switchView(view) {
    state.view = view;
    refresh();
  },
  async selectFile(path, staged, untracked) {
    state.selectedFile = { path, staged, untracked };
    state.busy.diff = true;
    renderAll();
    try {
      const { diff } = await api.diff(state.repoId, { file: path, staged, untracked });
      state.diffText = diff;
    } catch (err) { toast(err.message, 'error'); state.diffText = ''; }
    state.busy.diff = false;
    renderAll();
  },
  async selectCommit(sha) {
    state.selectedCommit = sha;
    state.commitFile = null; state.commitDiffText = '';
    state.commitDetail = null; state.busy.detail = true;
    renderAll();
    try {
      state.commitDetail = await api.commitDetail(state.repoId, sha);
    } catch (err) { toast(err.message, 'error'); }
    state.busy.detail = false;
    renderAll();
  },
  async selectCommitFile(path) {
    state.commitFile = path;
    state.busy.commitDiff = true;
    renderAll();
    try {
      const { diff } = await api.commitFileDiff(state.repoId, state.selectedCommit, path);
      state.commitDiffText = diff;
    } catch (err) { toast(err.message, 'error'); state.commitDiffText = ''; }
    state.busy.commitDiff = false;
    renderAll();
  },
};

async function remoteOp(op) {
  state.busy.remote = op;
  renderAll();
  try {
    const r = await api.remote(state.repoId, op);
    const labels = { fetch: '抓取', pull: '拉取', push: '推送' };
    if (r.ok) toast(`${labels[op]}完成`, 'success');
    else outputModal(labels[op], r.output, false);
    await refresh();
  } catch (err) { toast(err.message, 'error'); }
  state.busy.remote = null;
  renderAll();
}

async function doAddRepo(p) {
  try {
    const repo = await api.addRepo(p);
    await loadRepos();
    ctx.selectRepo(repo.id);
    toast(`已添加 ${repo.name}`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// 本机文件夹浏览器：面包屑 + 快捷根 + 目录行 + GIT 标记
function addRepoFlow() {
  let cur = null;
  const { mask } = modal({
    title: '从本机文件夹添加',
    wide: true,
    body: `
      <div class="fs-quick" id="fs-quick"></div>
      <div class="fs-crumbs" id="fs-crumbs"></div>
      <div class="fs-list" id="fs-list"></div>
      <div class="form-field" style="margin-top:16px">
        <label>或手动输入路径</label>
        <input type="text" id="fs-manual" placeholder="/path/to/repo">
      </div>`,
    actions: [
      { label: '取消', kind: 'ghost', onClick: (close) => close() },
      {
        label: '添加此文件夹', kind: 'primary',
        onClick: async (close) => {
          const p = mask.querySelector('#fs-manual').value.trim() || cur;
          if (!p) { toast('请选择一个目录', 'error'); return; }
          close();
          await doAddRepo(p);
        },
      },
    ],
  });

  async function load(p) {
    const listEl = mask.querySelector('#fs-list');
    listEl.innerHTML = '<div style="padding:24px;text-align:center"><span class="spinner"></span></div>';
    try {
      const d = await api.fsList(p);
      cur = d.path;
      mask.querySelector('#fs-manual').value = d.path;
      const quick = mask.querySelector('#fs-quick');
      quick.innerHTML = [
        ['Home', d.home], ['Documents', `${d.home}/Documents`], ['Desktop', `${d.home}/Desktop`],
        ['Downloads', `${d.home}/Downloads`], ['根目录', '/'],
      ].map(([l, pp]) => `<button class="btn sm" data-fs="${esc(pp)}">${esc(l)}</button>`).join('');
      quick.querySelectorAll('[data-fs]').forEach((b) => b.addEventListener('click', () => load(b.dataset.fs)));
      const parts = d.path.split('/').filter(Boolean);
      let acc = '';
      const crumbs = mask.querySelector('#fs-crumbs');
      crumbs.innerHTML = '<button data-fs="/">/</button>' + parts.map((seg, i) => {
        acc += `/${seg}`;
        return `${i ? '<span class="sep">/</span>' : ''}<button data-fs="${esc(acc)}">${esc(seg)}</button>`;
      }).join('');
      crumbs.querySelectorAll('[data-fs]').forEach((b) => b.addEventListener('click', () => load(b.dataset.fs)));
      listEl.innerHTML =
        (d.parent ? `<div class="fs-row" data-fs="${esc(d.parent)}">${icon('folder-open', 14)} ..</div>` : '') +
        (d.dirs.map((dir) => `
          <div class="fs-row" data-fs="${esc(dir.path)}">${icon('folder', 14)} ${esc(dir.name)}${dir.isRepo ? '<span class="fs-git">GIT</span>' : ''}</div>`).join('')
          || '<div class="faint" style="padding:12px">无子目录</div>');
      listEl.querySelectorAll('[data-fs]').forEach((r) => r.addEventListener('click', () => load(r.dataset.fs)));
    } catch (err) {
      listEl.innerHTML = `<div class="faint" style="padding:12px">${esc(err.message)}</div>`;
    }
  }
  load(null);
}

// ---------- 渲染 ----------
function renderSidebar() {
  const el = $('#sidebar');
  const changeCount = state.status?.files.length || 0;
  el.innerHTML = `
    <div class="side-section">
      <div class="side-title">导航</div>
      <div class="nav">
        ${Object.entries(VIEWS).filter(([key]) => key !== 'settings').map(([key, v], i) => `
          <div class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}">
            <span class="nav-idx">${String(i + 1).padStart(2, '0')}</span><span>${v.label}</span>
            ${key === 'changes' && changeCount ? `<span class="nav-count">${changeCount}</span>` : ''}
            <span class="nav-dot"></span>
          </div>`).join('')}
      </div>
    </div>
    <div class="side-section">
      <div class="side-title">仓库 <button class="icon-btn" id="add-repo" title="添加仓库" style="width:22px;height:22px">${icon('plus', 13, 2)}</button></div>
      <div class="repo-list">
        ${state.repos.map((r) => `
          <div class="repo-item ${r.id === state.repoId ? 'active' : ''} ${r.valid ? '' : 'invalid'}" data-repo="${r.id}" title="${esc(r.path)}">
            ${icon('folder', 14)}
            <span class="repo-name">${esc(r.name)}</span>
            <span class="repo-remove" data-remove="${r.id}" title="从列表移除">${icon('x', 12, 2)}</span>
          </div>`).join('') || '<div class="faint" style="padding:10px 20px;font-size:11px">还没有仓库</div>'}
      </div>
    </div>
    <div class="side-ghost">banyan</div>`;

  el.querySelector('#add-repo').addEventListener('click', addRepoFlow);
  el.querySelectorAll('.repo-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      const removeId = e.target.closest('[data-remove]')?.dataset.remove;
      if (removeId) {
        e.stopPropagation();
        const repo = state.repos.find((r) => r.id === removeId);
        confirmModal({
          title: '移除仓库',
          message: `从列表移除 <b>${esc(repo.name)}</b>？不会删除磁盘上的任何文件。`,
          confirmLabel: '移除',
          onConfirm: async () => {
            await api.removeRepo(removeId);
            await loadRepos();
            if (state.repoId === removeId) {
              state.repoId = null; state.status = null;
              if (state.repos.length) ctx.selectRepo(state.repos[0].id);
              else renderAll();
            } else renderAll();
          },
        });
        return;
      }
      ctx.selectRepo(item.dataset.repo);
    });
  });
  el.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (!state.repoId && item.dataset.view !== 'settings') { toast('请先添加仓库', 'info'); return; }
      ctx.switchView(item.dataset.view);
    });
  });
}

function renderTopbar() {
  const el = $('#topbar');
  const repo = currentRepo();
  if (!repo) {
    el.innerHTML = `<div class="topbar-logo">${logoMark(22)}<span class="logo-name">Banyan</span></div><span style="flex:1"></span><div class="topbar-right"><button class="icon-btn ${state.view === 'settings' ? 'active' : ''}" id="settings-btn" title="设置">${icon('settings', 16)}</button><button class="icon-btn" id="theme-toggle" title="切换主题">${icon(state.settings.theme === 'dark' ? 'sun' : 'moon', 16)}</button></div>`;
    el.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
    el.querySelector('#settings-btn').addEventListener('click', () => ctx.switchView('settings'));
    return;
  }
  const st = state.status;
  const branchLabel = st?.branch || (st?.detached ? `游离 ${(st.oid || '').slice(0, 7)}` : st ? '初始提交前' : '加载中');
  const busy = state.busy.remote;
  el.innerHTML = `
    <div class="topbar-logo">${logoMark(22)}<span class="logo-name">Banyan</span></div>
    <div class="topbar-title">${esc(repo.name)}</div>
    <div class="branch-chip" id="branch-chip" title="点击查看分支">${icon('branch', 13, 2)} <span>${esc(branchLabel)}</span></div>
    <div class="sync-group">
      <button class="btn sm" id="op-fetch" ${busy ? 'disabled' : ''}>${busy === 'fetch' ? '<span class="spinner"></span>' : icon('fetch', 13)} <span class="btn-label">抓取</span></button>
      <button class="btn sm" id="op-pull" ${busy ? 'disabled' : ''}>${busy === 'pull' ? '<span class="spinner"></span>' : icon('pull', 13)} <span class="btn-label">拉取</span>${st?.behind ? ` <span class="badge">${st.behind}</span>` : ''}</button>
      ${pill(`推送${st?.ahead ? ` ${st.ahead}` : ''}`, { cls: 'sm', attrs: `id="op-push" ${busy ? 'disabled' : ''}`, ic: 'push' })}
    </div>
    <div class="topbar-right">
      ${state.identity?.name ? `<span class="identity">${icon('user', 13)} ${esc(state.identity.name)}</span>` : ''}
      <button class="icon-btn" id="refresh-btn" title="刷新">${icon('refresh', 15)}</button>
      <button class="icon-btn ${state.view === 'settings' ? 'active' : ''}" id="settings-btn" title="设置">${icon('settings', 16)}</button>
      <button class="icon-btn" id="theme-toggle" title="切换主题">${icon(state.settings.theme === 'dark' ? 'sun' : 'moon', 16)}</button>
    </div>`;
  el.querySelector('#branch-chip').addEventListener('click', () => ctx.switchView('history'));
  el.querySelector('#op-fetch').addEventListener('click', () => remoteOp('fetch'));
  el.querySelector('#op-pull').addEventListener('click', () => remoteOp('pull'));
  el.querySelector('#op-push').addEventListener('click', () => remoteOp('push'));
  el.querySelector('#refresh-btn').addEventListener('click', refresh);
  el.querySelector('#settings-btn').addEventListener('click', () => ctx.switchView('settings'));
  el.querySelector('#theme-toggle').addEventListener('click', toggleTheme);
}

async function toggleTheme() {
  const theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  state.settings = await api.saveSettings({ theme });
  document.documentElement.dataset.theme = theme;
  renderAll();
}

function renderView() {
  const el = $('#view');
  if (!state.repoId) {
    el.innerHTML = `
      <div class="empty center" style="flex:1">
        <div class="micro">[Banyan] Local Git Client</div>
        <div class="empty-word">独木成林.</div>
        <div class="empty-desc">轻量、现代、中文的本地 Git 客户端。<br>从本机文件夹添加一个仓库开始，所有数据只保存在你的机器上。</div>
        ${pill('添加仓库', { attrs: 'id="welcome-add" style="margin-top:10px"', ic: 'plus' })}
      </div>`;
    el.querySelector('#welcome-add').addEventListener('click', addRepoFlow);
    return;
  }
  const { mod } = VIEWS[state.view];
  el.innerHTML = mod.render(state);
  mod.bind(el, ctx);
}

function renderAll() {
  // 记录滚动位置，重渲染后恢复
  const scrolls = {};
  for (const sel of ['.file-sections', '.history-scroll', '.history-tree', '.bt-page', '.diff-body', '.detail-diff', '.page']) {
    const node = $(sel);
    if (node) scrolls[sel] = node.scrollTop;
  }
  const msgFocused = document.activeElement?.id === 'commit-msg';
  const msgPos = msgFocused ? document.activeElement.selectionStart : 0;

  renderSidebar();
  renderTopbar();
  renderView();

  for (const [sel, top] of Object.entries(scrolls)) {
    const node = $(sel);
    if (node) node.scrollTop = top;
  }
  if (msgFocused) {
    const box = $('#commit-msg');
    if (box) { box.focus(); box.setSelectionRange(msgPos, msgPos); }
  }
}

// ---------- 启动 ----------
async function init() {
  // 桌面壳：红绿灯独立灯条 + 显式拖拽（Overlay 下 data-tauri-drag-region 不生效）
  if ('__TAURI_INTERNALS__' in window) {
    document.documentElement.dataset.shell = 'desktop';
    const invoke = (cmd) => window.__TAURI_INTERNALS__.invoke(cmd).catch(() => {});
    const draggable = (t) => t.closest('#titlebar')
      || (t.closest('#topbar') && !t.closest('button, input, .branch-chip, .pill'));
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && draggable(e.target)) invoke('plugin:window|start_dragging');
    });
    document.getElementById('titlebar').addEventListener('dblclick', () => invoke('plugin:window|toggle_maximize'));
  }
  state.settings = await api.settings();
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
  state.logAll = state.settings.logAll !== false;
  await loadRepos();
  if (state.repos.length) {
    state.repoId = state.repos[0].id;
    renderAll();
    refresh();
  } else renderAll();

  let focusTimer = null;
  window.addEventListener('focus', () => {
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => { if (state.repoId) refresh(); }, 400);
  });
}

init().catch((err) => toast(`初始化失败：${err.message}`, 'error'));