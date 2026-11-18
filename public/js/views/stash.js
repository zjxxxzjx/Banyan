import { api } from '../api.js';
import { esc, toast, timeAgo, confirmModal, outputModal, pill } from '../util.js';
import { t } from '../i18n.js';

const COLS = '54px minmax(0,1.6fr) minmax(0,2.4fr) 90px 190px';

export function render(state) {
  const items = state.stashes;
  return `
    <div class="page">
      <div class="page-label micro"><b>[03]</b> Stash — ${items.length} entries</div>
      <div class="page-head">
        <div class="page-title display">${t('贮藏')}</div>
      </div>
      <div class="page-desc">${t('临时收起未提交的改动，随时恢复。切换分支处理别的事之前，先把工作区存进来。')}</div>
      <div class="form-card" style="border-top:none;padding-top:0;margin-bottom:28px">
        <div class="form-row">
          <div class="form-field" style="flex:1;min-width:220px">
            <label>${t('Message / 贮藏说明')}</label>
            <input type="text" id="stash-msg" placeholder="${t('例如：改到一半的登录逻辑')}">
          </div>
          <label class="check" style="padding-bottom:9px"><input type="checkbox" id="stash-untracked" checked> ${t('包含新文件')}</label>
          ${pill(t('保存贮藏'), { attrs: 'data-act="stash-save"', ic: 'archive' })}
        </div>
      </div>
      ${items.length ? `
      <div class="idx">
        <div class="idx-head" style="grid-template-columns:${COLS}">
          <span>Ref</span><span>Subject</span><span class="idx-hide-m">Detail</span><span class="idx-hide-m">Saved</span><span style="text-align:right">Actions</span>
        </div>
        ${items.map((s, i) => `
          <div class="idx-row" style="grid-template-columns:${COLS}">
            <span class="idx-no">${esc(s.ref.replace('stash@{', '').replace('}', ''))}</span>
            <span class="idx-main">${esc(s.subject)}</span>
            <span class="idx-sub idx-hide-m">${esc(s.ref)}</span>
            <span class="idx-mono idx-hide-m">${timeAgo(s.time)}</span>
            <span class="idx-actions">
              <button class="btn" data-act="apply" data-ref="${esc(s.ref)}">${t('应用')}</button>
              <button class="btn" data-act="pop" data-ref="${esc(s.ref)}">${t('弹出')}</button>
              <button class="btn danger" data-act="drop" data-ref="${esc(s.ref)}">${t('删除')}</button>
            </span>
          </div>`).join('')}
      </div>` : `
      <div class="empty">
        <div class="micro">[Stash] Empty</div>
        <div class="empty-word">Stash.</div>
        <div class="empty-desc">${t('暂无贮藏。需要临时切换分支时，把当前改动存进来，回来再恢复。')}</div>
      </div>`}
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;
  const id = state.repoId;

  root.querySelector('[data-act="stash-save"]')?.addEventListener('click', async () => {
    const message = root.querySelector('#stash-msg').value.trim();
    const includeUntracked = root.querySelector('#stash-untracked').checked;
    try {
      const r = await api.stashPush(id, message, includeUntracked);
      if (r.ok) { toast(t('已贮藏'), 'success'); await ctx.refresh(); }
      else outputModal(t('贮藏'), r.output, false);
    } catch (err) { toast(err.message, 'error'); }
  });

  const opHandler = (op) => async (e) => {
    const ref = e.currentTarget.dataset.ref;
    try {
      const r = await api.stashOp(id, op, ref);
      if (r.ok) { toast(op === 'drop' ? t('已删除贮藏') : t('贮藏已恢复'), 'success'); await ctx.refresh(); }
      else outputModal(t('贮藏 {0}', op), r.output, false);
    } catch (err) { toast(err.message, 'error'); }
  };

  root.querySelectorAll('[data-act="apply"]').forEach((b) => b.addEventListener('click', opHandler('apply')));
  root.querySelectorAll('[data-act="pop"]').forEach((b) => b.addEventListener('click', opHandler('pop')));
  root.querySelectorAll('[data-act="drop"]').forEach((b) => b.addEventListener('click', (e) => {
    const ref = e.currentTarget.dataset.ref;
    confirmModal({
      title: t('删除贮藏'), message: t('删除 <b class="mono">{0}</b>？其中的改动将无法恢复。', esc(ref)),
      confirmLabel: t('删除'), danger: true,
      onConfirm: () => opHandler('drop')({ currentTarget: { dataset: { ref } } }),
    });
  }));
}