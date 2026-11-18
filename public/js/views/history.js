import { api } from '../api.js';
import { esc, toast, fullTime, refCluster, bindRefClusters, confirmModal, promptModal, outputModal, modal, contextMenu } from '../util.js';
import { icon } from '../icons.js';
import { buildGraph, graphSvg } from '../graph.js';
import { renderDiff } from '../diff.js';
import { renderTree, bindTree } from './branchtree.js';

const hoverActions = (b) => b.remote
  ? `<button class="btn" data-act="checkout-remote" data-name="${esc(b.name)}">检出</button>
     <button class="btn danger" data-act="delete-remote" data-name="${esc(b.name)}">删除</button>`
  : `${!b.current ? `<button class="btn" data-act="checkout" data-name="${esc(b.name)}">切换</button>` : ''}
     <button class="btn" data-act="rename" data-name="${esc(b.name)}">改名</button>
     ${!b.current ? `<button class="btn danger" data-act="delete" data-name="${esc(b.name)}">删除</button>` : ''}`;

export function render(state) {
  const remoteNames = state.remotes.map((r) => r.name);
  const filter = (state.logFilter || '').toLowerCase();
  const commits = filter
    ? state.log.filter((c) => c.subject.toLowerCase().includes(filter) || c.author.toLowerCase().includes(filter) || c.sha.startsWith(filter))
    : state.log;
  const graph = buildGraph(commits, { headSha: state.status?.oid });
  const gw = `${graph.width}px`;

  const rows = commits.map((c, i) => {
    const selected = state.selectedCommit === c.sha;
    return `
      <div class="commit-row ${selected ? 'selected' : ''}" data-sha="${c.sha}" style="--gw:${gw}">
        <span class="commit-graph-cell" style="width:${gw}"></span>
        <div class="commit-cell-main">
          <span class="commit-subject">${esc(c.subject)}</span>
          <span class="commit-refs">${refCluster(c.refs, remoteNames)}</span>
        </div>
        <span class="commit-author">${esc(c.author)}</span>
        <span class="commit-time">${fullTime(c.time)}</span>
      </div>`;
  }).join('');

  let detail = '';
  if (state.selectedCommit) {
    const d = state.commitDetail;
    if (!d || state.busy.detail) {
      detail = '<div class="commit-detail"><div class="empty"><span class="spinner"></span></div></div>';
    } else {
      detail = `
        <div class="commit-detail">
          <div class="detail-head">
            <button class="icon-btn detail-close" data-act="close-detail" title="关闭详情">${icon('x', 14, 2)}</button>
            <div class="detail-subject">${esc(d.subject)} <span class="commit-refs">${refCluster(d.refs, remoteNames)}</span></div>
            <div class="detail-meta">
              <span>${icon('user', 12)} ${esc(d.author)} &lt;${esc(d.email)}&gt;</span>
              <span>${icon('clock', 12)} ${fullTime(d.time)}</span>
              <span class="mono" style="cursor:pointer" data-act="copy-sha" title="点击复制完整 SHA">${icon('key', 12)} ${d.sha}</span>
            </div>
            ${d.body ? `<div class="detail-body-text">${esc(d.body)}</div>` : ''}
          </div>
          <div class="detail-files">
            ${d.files.map((f) => `
              <div class="file-row ${state.commitFile === f.path ? 'selected' : ''}" data-cfile="${esc(f.path)}">
                <span class="file-status fs-${esc(f.status)}">${esc(f.status)}</span>
                <span class="file-path">${esc(f.path)}</span>
              </div>`).join('') || '<div class="faint" style="padding:8px">无文件变更</div>'}
          </div>
          <div class="detail-diff">${state.commitFile ? (state.busy.commitDiff ? '<div class="empty center"><span class="spinner"></span></div>' : renderDiff(state.commitDiffText)) : `<div class="empty"><div class="micro">[Diff] Pick a file</div><div class="empty-desc">点击文件查看该提交的改动。</div></div>`}</div>
        </div>`;
    }
  }

  const scopeBar = state.logBranch
    ? `<span class="badge-ref head branch-filter" data-act="clear-branch" title="点击清除分支过滤">${icon('branch', 11, 2)} ${esc(state.logBranch)} ${icon('x', 10, 2)}</span>`
    : `<div class="seg">
        <button data-scope="all" class="${state.logAll ? 'active' : ''}">所有分支</button>
        <button data-scope="current" class="${state.logAll ? '' : 'active'}">当前分支</button>
      </div>`;

  return `
    <div class="history-layout">
      <div class="history-tree">${renderTree(state, { selected: state.logBranch, actions: hoverActions })}</div>
      <div class="history-main">
        <div class="history-toolbar">
          ${scopeBar}
          <input type="text" id="log-filter" placeholder="搜索提交信息 / 作者 / SHA" value="${esc(state.logFilter || '')}">
          <span class="faint" style="font-size:12px">${commits.length} 个提交</span>
          <span style="flex:1"></span>
          <button class="btn sm ghost" data-act="new-branch">${icon('plus', 12, 2)} 新建分支</button>
          <button class="btn sm ghost" data-act="refresh-log">刷新</button>
        </div>
        <div class="history-cols micro" style="--gw:${gw}"><span></span><span>提交</span><span>作者</span><span>时间</span></div>
        <div class="history-scroll">
          ${commits.length ? `<div class="history-rows">${graphSvg(graph)}${rows}</div>` : `<div class="empty"><div class="micro">[History] Empty</div><div class="empty-word">History.</div><div class="empty-desc">在「变更」页完成第一次提交后，这里会展示提交历史图。</div></div>`}
          ${!filter && state.log.length >= state.logLimit ? '<div class="load-more"><button class="btn" data-act="load-more">加载更多</button></div>' : ''}
        </div>
      </div>
      ${detail}
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;
  const id = state.repoId;
  bindRefClusters(root);

  bindTree(root, ctx, {
    onSelect: async (name) => {
      state.logBranch = state.logBranch === name ? null : name;
      state.logSkip = 0;
      await ctx.loadLog();
      ctx.renderAll();
    },
    onContext: (name, kind, x, y) => openBranchMenu(name, kind, x, y),
  });
  root.querySelector('[data-act="clear-branch"]')?.addEventListener('click', async () => {
    state.logBranch = null;
    state.logSkip = 0;
    await ctx.loadLog();
    ctx.renderAll();
  });

  root.querySelectorAll('.commit-row').forEach((row) => {
    row.addEventListener('click', () => ctx.selectCommit(row.dataset.sha));
  });
  root.querySelectorAll('[data-cfile]').forEach((row) => {
    row.addEventListener('click', () => ctx.selectCommitFile(row.dataset.cfile));
  });
  root.querySelectorAll('[data-scope]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.logAll = btn.dataset.scope === 'all';
      state.logSkip = 0;
      await ctx.loadLog();
      ctx.renderAll();
    });
  });
  const filterInput = root.querySelector('#log-filter');
  filterInput.addEventListener('input', () => {
    state.logFilter = filterInput.value;
    const scroll = root.querySelector('.history-scroll');
    const top = scroll?.scrollTop || 0;
    ctx.renderAll();
    const el = document.querySelector('.history-scroll');
    if (el) el.scrollTop = top;
    document.querySelector('#log-filter')?.focus();
  });
  root.querySelector('[data-act="refresh-log"]')?.addEventListener('click', async () => {
    state.logSkip = 0;
    await ctx.loadLog();
    ctx.renderAll();
  });
  root.querySelector('[data-act="load-more"]')?.addEventListener('click', async () => {
    state.logSkip = state.log.length;
    const more = await api.log(id, { limit: state.logLimit, skip: state.logSkip, all: state.logAll, branch: state.logBranch });
    state.log = [...state.log, ...more];
    ctx.renderAll();
  });
  root.querySelector('[data-act="close-detail"]')?.addEventListener('click', () => ctx.selectCommit(state.selectedCommit));
  root.querySelector('[data-act="copy-sha"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.commitDetail.sha);
      toast('SHA 已复制', 'success');
    } catch { toast('复制失败', 'error'); }
  });

  // ---------- 分支管理（hover 动作 + 右键菜单） ----------
  const cur = () => state.status?.branch || 'HEAD';
  const on = (act, fn) => root.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn(e.currentTarget.dataset.name);
  }));
  const doCheckout = async (name, remote) => {
    const target = remote ? name.split('/').slice(1).join('/') : name;
    await api.checkout(id, target);
    toast(`已切换到 ${target}`, 'success');
    await ctx.refresh();
  };
  const doMerge = (name) => confirmModal({
    title: '合并分支',
    message: `将 <b class="mono">${esc(name)}</b> 合并到当前分支 <b class="mono">${esc(cur())}</b>？`,
    confirmLabel: '合并',
    onConfirm: async () => {
      const r = await api.merge(id, name);
      outputModal(`合并 ${name}`, r.output, r.ok);
      if (r.ok) toast('合并完成', 'success');
      else toast('合并出现冲突，请在「变更」页处理', 'error');
      await ctx.refresh();
    },
  });
  const doRename = (name) => promptModal({
    title: '重命名分支', label: `新名称（原：${name}）`, value: name,
    onConfirm: async (v) => {
      try { await api.renameBranch(id, name, v); toast('已重命名', 'success'); await ctx.refresh(); }
      catch (err) { toast(err.message, 'error'); }
    },
  });
  const tryDelete = async (name, force, remote) => {
    try {
      await api.deleteBranch(id, name, { force, remote });
      toast(`已删除 ${name}`, 'success');
      await ctx.refresh();
    } catch (err) {
      if (!force && !remote && /not fully merged|未完全合并/.test(err.message)) {
        confirmModal({
          title: '分支未合并',
          message: `<b class="mono">${esc(name)}</b> 尚未合并到当前分支，强制删除会丢失其独有提交。仍要删除吗？`,
          confirmLabel: '强制删除', danger: true,
          onConfirm: () => tryDelete(name, true, remote),
        });
      } else toast(err.message, 'error');
    }
  };
  const doDelete = (name, remote) => confirmModal({
    title: remote ? '删除远程分支' : '删除分支',
    message: remote
      ? `将从远程删除 <b class="mono">${esc(name)}</b>，影响所有协作者。确定吗？`
      : `删除本地分支 <b class="mono">${esc(name)}</b>？`,
    confirmLabel: remote ? '删除远程分支' : '删除', danger: true,
    onConfirm: () => tryDelete(name, false, remote),
  });
  const doRebase = async (onto, title) => {
    const r = await api.rebase(id, onto);
    outputModal(title, r.output, r.ok);
    if (r.ok) toast('变基完成', 'success');
    else toast('变基出现冲突，请在「变更」页处理', 'error');
    await ctx.refresh();
  };
  const newBranchFrom = (from) => promptModal({
    title: '新建分支', label: from ? `基于 ${from}` : '分支名称（基于当前 HEAD）', placeholder: 'feature/xxx',
    onConfirm: async (name) => {
      try {
        await api.createBranch(id, name, from);
        await api.checkout(id, name);
        toast(`分支 ${name} 已创建并切换`, 'success');
      } catch (err) { toast(err.message, 'error'); }
      await ctx.refresh();
    },
  });
  const openCompare = async (name) => {
    try {
      const [cmp, df] = await Promise.all([api.compare(id, name), api.branchDiff(id, name, 'compare')]);
      const list = (arr) => arr.map((c) => `<div class="cmp-row"><span class="mono">${c.sha.slice(0, 7)}</span><span>${esc(c.subject)}</span></div>`).join('') || '<div class="faint" style="padding:4px 0">无</div>';
      modal({
        title: `比较 ${name} ↔ ${cur()}`, wide: true,
        body: `
          <div class="cmp-lists">
            <div><div class="micro" style="margin-bottom:6px">${esc(name)} 独有 · ${cmp.ahead.length}</div>${list(cmp.ahead)}</div>
            <div><div class="micro" style="margin-bottom:6px">${esc(cur())} 独有 · ${cmp.behind.length}</div>${list(cmp.behind)}</div>
          </div>
          <div class="detail-diff cmp-diff">${df.diff ? renderDiff(df.diff) : '<div class="faint" style="padding:12px">两分支无差异</div>'}</div>`,
        actions: [{ label: '关闭', kind: 'primary', onClick: (close) => close() }],
      });
    } catch (err) { toast(err.message, 'error'); }
  };
  const openWorktreeDiff = async (name) => {
    try {
      const { diff } = await api.branchDiff(id, name, 'worktree');
      modal({
        title: `${name} ↔ 工作树`, wide: true,
        body: `<div class="detail-diff cmp-diff">${diff ? renderDiff(diff) : '<div class="faint" style="padding:12px">无差异</div>'}</div>`,
        actions: [{ label: '关闭', kind: 'primary', onClick: (close) => close() }],
      });
    } catch (err) { toast(err.message, 'error'); }
  };
  const newWorktreeFrom = (from) => {
    const { mask } = modal({
      title: `从 ${from} 新建工作树`,
      body: `
        <div class="form-field"><label>工作树路径</label><input type="text" id="wt-path" placeholder="/path/to/worktree"></div>
        <div class="form-field"><label>新分支名称</label><input type="text" id="wt-branch" placeholder="feature/xxx"></div>`,
      actions: [
        { label: '取消', kind: 'ghost', onClick: (close) => close() },
        {
          label: '创建', kind: 'primary',
          onClick: async (close) => {
            const p = mask.querySelector('#wt-path').value.trim();
            const nb = mask.querySelector('#wt-branch').value.trim();
            if (!p || !nb) { toast('路径与分支名都不能为空', 'error'); return; }
            try {
              await api.addWorktree(id, p, nb, nb, from);
              toast(`工作树已创建：${p}`, 'success');
              close();
              await ctx.refresh();
            } catch (err) { toast(err.message, 'error'); }
          },
        },
      ],
    });
  };
  const doPush = async (name) => {
    const r = await api.pushBranch(id, name);
    outputModal(`推送 ${name}`, r.output, r.ok);
    if (r.ok) toast('推送完成', 'success');
    await ctx.refresh();
  };

  const openBranchMenu = (name, kind, x, y) => {
    const b = state.branches.find((v) => v.name === name);
    const isCur = !!b?.current;
    const c = cur();
    const items = kind === 'remote' ? [
      { label: '签出', onClick: () => doCheckout(name, true).catch((e) => toast(e.message, 'error')) },
      { label: `与 '${c}' 比较`, onClick: () => openCompare(name) },
      { label: '显示与工作树的差异', onClick: () => openWorktreeDiff(name) },
      { label: `将 '${name}' 合并到 '${c}' 中`, onClick: () => doMerge(name) },
      '-',
      { label: '删除远程分支', danger: true, onClick: () => doDelete(name, true) },
    ] : [
      { label: '签出', disabled: isCur, onClick: () => doCheckout(name).catch((e) => toast(e.message, 'error')) },
      { label: `从 '${name}' 新建分支…`, onClick: () => newBranchFrom(name) },
      { label: `签出并变基到 '${c}'`, disabled: isCur, onClick: async () => { try { await api.checkout(id, name); await doRebase(c, `变基到 ${c}`); } catch (e) { toast(e.message, 'error'); } } },
      { label: '签出并更新', disabled: isCur || !b?.upstream, onClick: async () => { try { await api.checkout(id, name); const r = await api.remote(id, 'pull'); if (!r.ok) outputModal('拉取', r.output, false); await ctx.refresh(); } catch (e) { toast(e.message, 'error'); } } },
      '-',
      { label: `与 '${c}' 比较`, disabled: isCur, onClick: () => openCompare(name) },
      { label: '显示与工作树的差异', onClick: () => openWorktreeDiff(name) },
      '-',
      { label: `将 '${c}' 变基到 '${name}'`, disabled: isCur, onClick: () => doRebase(name, `变基到 ${name}`) },
      { label: `将 '${name}' 合并到 '${c}' 中`, disabled: isCur, onClick: () => doMerge(name) },
      '-',
      { label: `从 '${name}' 新建工作树…`, onClick: () => newWorktreeFrom(name) },
      '-',
      { label: '推送…', onClick: () => doPush(name) },
      '-',
      { label: '重命名…', onClick: () => doRename(name) },
      { label: '删除', danger: true, disabled: isCur, onClick: () => doDelete(name, false) },
    ];
    contextMenu(items, x, y);
  };

  on('checkout', (name) => doCheckout(name).catch((e) => toast(e.message, 'error')));
  on('checkout-remote', (name) => doCheckout(name, true).catch((e) => toast(e.message, 'error')));
  on('rename', doRename);
  on('delete', (name) => doDelete(name, false));
  on('delete-remote', (name) => doDelete(name, true));
  root.querySelector('[data-act="new-branch"]')?.addEventListener('click', () => newBranchFrom(null));
}