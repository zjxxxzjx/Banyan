import { api } from '../api.js';
import { esc, toast, confirmModal, pill } from '../util.js';
import { icon } from '../icons.js';
import { renderDiff } from '../diff.js';

function statusLetter(f) {
  if (f.conflicted) return 'C';
  if (f.untracked) return 'U';
  const c = f.x !== '.' && f.x !== '?' ? f.x : f.y;
  return c === '?' ? 'U' : c;
}

function fileRow(f, staged, selected) {
  const letter = staged ? f.x : statusLetter(f);
  const sel = selected && selected.path === f.path && selected.staged === staged;
  return `
    <div class="file-row ${sel ? 'selected' : ''}" data-path="${esc(f.path)}" data-staged="${staged ? 1 : 0}" data-untracked="${f.untracked ? 1 : 0}">
      <input type="checkbox" ${staged ? 'checked' : ''} data-role="stage-check">
      <span class="file-status fs-${esc(letter)}">${esc(letter)}</span>
      <span class="file-path" title="${esc(f.origPath ? f.origPath + ' → ' + f.path : f.path)}">${esc(f.path)}</span>
      ${!staged ? `<button class="icon-btn row-action" data-role="discard" title="丢弃更改">↺</button>` : ''}
    </div>`;
}

export function render(state) {
  const st = state.status;
  if (!st) return '<div class="empty"><span class="spinner"></span></div>';
  const staged = st.files.filter((f) => !f.untracked && !f.conflicted && f.x !== '.');
  const unstaged = st.files.filter((f) => f.untracked || f.conflicted || f.y !== '.');
  const conflicted = st.files.filter((f) => f.conflicted);
  const sel = state.selectedFile;

  let sections = '';
  if (conflicted.length) {
    sections += `
      <div>
        <div class="file-section-head" style="color:var(--danger)">${icon('alert', 13, 2)} 合并冲突 <span class="count">${conflicted.length}</span></div>
        ${conflicted.map((f) => fileRow(f, false, sel)).join('')}
      </div>`;
  }
  sections += `
    <div>
      <div class="file-section-head">已暂存 <span class="count">${staged.length}</span>
        ${staged.length ? '<span class="sec-actions"><button class="btn sm ghost" data-act="unstage-all">全部取消</button></span>' : ''}
      </div>
      ${staged.length ? staged.map((f) => fileRow(f, true, sel)).join('') : '<div class="faint" style="padding:4px 8px;font-size:12px">暂无已暂存文件</div>'}
    </div>
    <div>
      <div class="file-section-head">更改 <span class="count">${unstaged.length}</span>
        ${unstaged.length ? `<span class="sec-actions">
          <button class="btn sm ghost" data-act="stage-all">全部暂存</button>
          <button class="btn sm ghost" data-act="discard-all" style="color:var(--danger)">全部丢弃</button>
        </span>` : ''}
      </div>
      ${unstaged.length ? unstaged.map((f) => fileRow(f, false, sel)).join('') : '<div class="faint" style="padding:4px 8px;font-size:12px">工作区干净</div>'}
    </div>`;

  const canCommit = (staged.length > 0 || state.amend) && !state.busy.commit;
  const commitLabel = state.amend ? '修补提交 (amend)' : `提交${staged.length ? ` · ${staged.length} 个文件` : ''}`;

  const diffHeader = sel
    ? `<span class="diff-file">${esc(sel.path)}</span>
       <span class="badge-ref">${sel.untracked ? '新文件' : sel.staged ? '已暂存' : '未暂存'}</span>`
    : '<span class="faint">未选择文件</span>';

  return `
    <div class="changes-layout">
      <div class="changes-left">
        <div class="file-sections">${sections}</div>
        <div class="commit-box">
          <textarea id="commit-msg" placeholder="提交信息（feat/fix/docs…: 描述）">${esc(state.commitMsg)}</textarea>
          <div class="commit-actions">
            <label class="check"><input type="checkbox" id="amend-check" ${state.amend ? 'checked' : ''}> amend</label>
            <button class="btn sm ai-btn" data-act="ai" ${state.busy.ai ? 'disabled' : ''}>${state.busy.ai ? '<span class="spinner"></span>' : icon('sparkles', 13)} AI 生成</button>
          </div>
          <div class="commit-actions">
            ${pill(state.busy.commit ? '提交中…' : commitLabel, { attrs: `data-act="commit" ${canCommit ? '' : 'disabled'}`, ic: 'check' })}
          </div>
        </div>
      </div>
      <div class="diff-pane ${sel ? 'has-sel' : ''}">
        <div class="diff-header">${diffHeader}</div>
        <div class="diff-body">${sel ? (state.busy.diff ? '<div class="empty center"><span class="spinner"></span></div>' : renderDiff(state.diffText)) : `<div class="empty"><div class="micro">[Diff] No file selected</div><div class="empty-word">Select.</div><div class="empty-desc">左侧勾选文件即可暂存，点击文件名查看具体改动。</div></div>`}</div>
      </div>
    </div>`;
}

export function bind(root, ctx) {
  const { state } = ctx;
  const id = state.repoId;
  // 骨架屏（status 未就绪）没有可绑定元素
  if (!state.status) return;

  root.querySelectorAll('.file-row').forEach((row) => {
    const path = row.dataset.path;
    const staged = row.dataset.staged === '1';
    const untracked = row.dataset.untracked === '1';
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-role="stage-check"]') || e.target.closest('[data-role="discard"]')) return;
      ctx.selectFile(path, staged, untracked);
    });
    row.querySelector('[data-role="stage-check"]').addEventListener('change', async (e) => {
      try {
        if (e.target.checked) await api.stage(id, [path]);
        else await api.unstage(id, [path]);
        await ctx.refresh();
      } catch (err) { toast(err.message, 'error'); }
    });
    row.querySelector('[data-role="discard"]')?.addEventListener('click', () => {
      confirmModal({
        title: '丢弃更改',
        message: `确定丢弃 <b class="mono">${esc(path)}</b> 的${untracked ? '新文件' : '未暂存更改'}吗？<br>此操作不可撤销。`,
        confirmLabel: '丢弃', danger: true,
        onConfirm: async () => {
          try {
            await api.discard(id, untracked ? [] : [path], untracked ? [path] : []);
            toast('已丢弃', 'success');
            await ctx.refresh();
          } catch (err) { toast(err.message, 'error'); }
        },
      });
    });
  });

  const act = (name, fn) => root.querySelector(`[data-act="${name}"]`)?.addEventListener('click', fn);

  act('stage-all', async () => {
    const paths = state.status.files.filter((f) => f.untracked || (!f.conflicted && f.y !== '.')).map((f) => f.path);
    try { await api.stage(id, paths); await ctx.refresh(); } catch (err) { toast(err.message, 'error'); }
  });
  act('unstage-all', async () => {
    const paths = state.status.files.filter((f) => !f.untracked && !f.conflicted && f.x !== '.').map((f) => f.path);
    try { await api.unstage(id, paths); await ctx.refresh(); } catch (err) { toast(err.message, 'error'); }
  });
  act('discard-all', () => {
    const files = state.status.files.filter((f) => f.untracked || (!f.conflicted && f.y !== '.'));
    confirmModal({
      title: '丢弃全部更改',
      message: `将丢弃 <b>${files.length}</b> 个文件的未暂存更改（含新文件），不可撤销。确定吗？`,
      confirmLabel: '全部丢弃', danger: true,
      onConfirm: async () => {
        try {
          await api.discard(id, files.filter((f) => !f.untracked).map((f) => f.path), files.filter((f) => f.untracked).map((f) => f.path));
          toast('已丢弃全部更改', 'success');
          await ctx.refresh();
        } catch (err) { toast(err.message, 'error'); }
      },
    });
  });

  const msgBox = root.querySelector('#commit-msg');
  msgBox.addEventListener('input', () => { state.commitMsg = msgBox.value; });
  root.querySelector('#amend-check').addEventListener('change', (e) => {
    state.amend = e.target.checked;
    ctx.renderAll();
  });

  act('ai', async () => {
    state.busy.ai = true; ctx.renderAll();
    try {
      const { message } = await api.aiCommit(id);
      state.commitMsg = message;
      toast('AI 提交信息已生成', 'success');
    } catch (err) { toast(err.message, 'error'); }
    state.busy.ai = false; ctx.renderAll();
  });

  act('commit', async () => {
    const message = state.commitMsg.trim();
    if (!message) { toast('请填写提交信息', 'error'); return; }
    state.busy.commit = true; ctx.renderAll();
    try {
      await api.commit(id, message, state.amend);
      state.commitMsg = '';
      state.amend = false;
      toast('提交成功', 'success');
      await ctx.refresh();
    } catch (err) { toast(err.message, 'error'); }
    state.busy.commit = false; ctx.renderAll();
  });
}