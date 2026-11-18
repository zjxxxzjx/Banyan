import { api } from '../api.js';
import { esc, toast, timeAgo, fullTime, confirmModal } from '../util.js';
import { t } from '../i18n.js';

const COLS = '70px minmax(0,2.6fr) 90px 100px 120px';

export function render(state) {
  const items = state.reflog;
  return `
    <div class="page">
      <div class="page-label micro"><b>[05]</b> Reflog — ${items.length} entries</div>
      <div class="page-head">
        <div class="page-title display">${t('操作日志')}</div>
      </div>
      <div class="page-desc">${t('HEAD 的每一次移动都被记录。误提交、误合并、误重置，都可以回到任意节点；回退使用 reset --keep，保留未提交修改。')}</div>
      ${items.length ? `
      <div class="idx">
        <div class="idx-head" style="grid-template-columns:${COLS}">
          <span>Head</span><span>Operation</span><span class="idx-hide-m">SHA</span><span class="idx-hide-m">When</span><span style="text-align:right">Undo</span>
        </div>
        ${items.map((r, i) => `
          <div class="idx-row" style="grid-template-columns:${COLS}">
            <span class="idx-no">${esc(r.ref.replace('HEAD@{', '@').replace('}', ''))}</span>
            <span class="idx-main">${esc(r.subject)}</span>
            <span class="idx-mono idx-hide-m">${r.sha.slice(0, 7)}</span>
            <span class="idx-mono idx-hide-m" title="${fullTime(r.time)}">${timeAgo(r.time)}</span>
            <span class="idx-actions">
              ${i > 0 ? `<button class="btn" data-act="undo" data-sha="${r.sha}" data-ref="${esc(r.ref)}">${t('回退到此')}</button>` : '<span class="idx-mono">current</span>'}
            </span>
          </div>`).join('')}
      </div>` : `
      <div class="empty">
        <div class="micro">[Reflog] Empty</div>
        <div class="empty-word">Log.</div>
        <div class="empty-desc">${t('暂无记录。')}</div>
      </div>`}
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;
  const id = state.repoId;

  root.querySelectorAll('[data-act="undo"]').forEach((b) => b.addEventListener('click', (e) => {
    const { sha, ref } = e.currentTarget.dataset;
    confirmModal({
      title: t('回退 HEAD'),
      message: t('将当前分支回退到 <b class="mono">{0}</b>（<span class="mono">{1}</span>）。<br>', esc(ref), sha.slice(0, 7)) +
        t('使用 <span class="mono">reset --keep</span>：保留未提交的本地修改，若会被覆盖则自动中止。<br>') +
        t('回退本身也会记入操作日志，随时可以再回来。'),
      confirmLabel: t('回退'), danger: true,
      onConfirm: async () => {
        try {
          await api.undo(id, sha);
          toast(t('已回退到 {0}', ref), 'success');
          await ctx.refresh();
        } catch (err) { toast(err.message, 'error'); }
      },
    });
  }));
}