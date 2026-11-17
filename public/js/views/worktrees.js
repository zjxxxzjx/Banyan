import { api } from '../api.js';
import { esc, toast, confirmModal, pill } from '../util.js';
import { icon } from '../icons.js';

const COLS = '44px minmax(0,2fr) minmax(0,1.2fr) 90px 180px';

export function render(state) {
  const trees = state.worktrees;
  const repo = state.repos.find((r) => r.id === state.repoId);
  const suggestPath = repo ? `${repo.path}-wt` : '';
  const isCurrent = (t) => repo && t.path === repo.path;
  return `
    <div class="page">
      <div class="page-label micro"><b>[04]</b> Worktrees — ${trees.length} entries</div>
      <div class="page-head">
        <div class="page-title display">并行工作区</div>
      </div>
      <div class="page-desc">同一仓库的多个工作目录，各自独立分支、互不干扰——不用频繁 stash / 切分支。添加后可把目录作为新仓库加入 Banyan 并行开发。</div>
      <div class="form-card" style="border-top:none;padding-top:0;margin-bottom:28px">
        <div class="form-row">
          <div class="form-field" style="flex:1.4;min-width:240px">
            <label>Directory / 工作区目录</label>
            <input type="text" id="wt-path" placeholder="${esc(suggestPath)}">
          </div>
          <div class="form-field" style="flex:1;min-width:160px">
            <label>Branch / 分支名</label>
            <input type="text" id="wt-branch" placeholder="feature/xxx">
          </div>
        </div>
        <div class="form-row">
          <label class="check"><input type="checkbox" id="wt-new" checked> 创建新分支（基于当前 HEAD）</label>
          <span style="flex:1"></span>
          ${pill('添加工作区', { attrs: 'data-act="wt-add"', ic: 'plus' })}
        </div>
      </div>
      <div class="idx">
        <div class="idx-head" style="grid-template-columns:${COLS}">
          <span>No.</span><span>Directory</span><span class="idx-hide-m">Branch</span><span class="idx-hide-m">SHA</span><span style="text-align:right">Actions</span>
        </div>
        ${trees.map((t, i) => `
          <div class="idx-row" style="grid-template-columns:${COLS}">
            <span class="idx-no">${String(i + 1).padStart(2, '0')}</span>
            <span class="idx-main" title="${esc(t.path)}">${esc(t.path.split('/').pop())}${t.main ? ' <span class="badge-ref head">main</span>' : ''}${isCurrent(t) && !t.main ? ' <span class="badge-ref head">current</span>' : ''}${t.detached ? ' <span class="badge-ref">detached</span>' : ''}</span>
            <span class="idx-sub idx-hide-m">${esc(t.branch || '(游离)')}</span>
            <span class="idx-mono idx-hide-m">${(t.sha || '').slice(0, 7)}</span>
            <span class="idx-actions">
              ${!t.main ? `<button class="btn" data-act="wt-open" data-path="${esc(t.path)}">打开</button>
              <button class="btn danger" data-act="wt-remove" data-path="${esc(t.path)}">移除</button>` : '<span class="idx-mono">primary</span>'}
            </span>
          </div>`).join('')}
      </div>
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;
  const id = state.repoId;

  // 移除的若是当前打开的工作区，自动回落到主工作区，避免指向已删除目录
  async function afterRemove(wtPath) {
    const cur = state.repos.find((r) => r.id === state.repoId);
    if (cur && cur.path === wtPath) {
      const main = state.worktrees.find((t) => t.main);
      await api.removeRepo(cur.id).catch(() => {});
      await ctx.loadRepos();
      const target = state.repos.find((r) => r.path === main?.path && r.valid) || state.repos.find((r) => r.valid);
      if (target) { ctx.selectRepo(target.id); return; }
      state.repoId = null; state.status = null;
      ctx.renderAll();
      return;
    }
    await ctx.refresh();
  }

  root.querySelector('[data-act="wt-add"]')?.addEventListener('click', async () => {
    const wtPath = root.querySelector('#wt-path').value.trim();
    const branch = root.querySelector('#wt-branch').value.trim();
    const newBranch = root.querySelector('#wt-new').checked;
    if (!wtPath || !branch) { toast('请填写目录和分支名', 'error'); return; }
    try {
      await api.addWorktree(id, wtPath, branch, newBranch);
      toast('工作区已创建', 'success');
      await ctx.refresh();
    } catch (err) { toast(err.message, 'error'); }
  });

  root.querySelectorAll('[data-act="wt-open"]').forEach((b) => b.addEventListener('click', async (e) => {
    try {
      const repo = await api.addRepo(e.currentTarget.dataset.path);
      await ctx.loadRepos();
      ctx.selectRepo(repo.id);
      toast('已作为仓库打开', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }));

  root.querySelectorAll('[data-act="wt-remove"]').forEach((b) => b.addEventListener('click', (e) => {
    const wtPath = e.currentTarget.dataset.path;
    confirmModal({
      title: '移除工作区',
      message: `移除 <b class="mono">${esc(wtPath)}</b>？目录将被删除（有未提交改动时会失败，可强制移除）。`,
      confirmLabel: '移除', danger: true,
      onConfirm: async () => {
        try {
          await api.removeWorktree(id, wtPath, false);
          toast('工作区已移除', 'success');
          await afterRemove(wtPath);
        } catch (err) {
          confirmModal({
            title: '移除失败',
            message: `${esc(err.message)}<br>强制移除会丢弃其中未提交的改动，继续吗？`,
            confirmLabel: '强制移除', danger: true,
            onConfirm: async () => {
              try { await api.removeWorktree(id, wtPath, true); toast('已强制移除', 'success'); await afterRemove(wtPath); }
              catch (e2) { toast(e2.message, 'error'); }
            },
          });
        }
      },
    });
  }));
}