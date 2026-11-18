import { icon } from './icons.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

export function fullTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toast(msg, kind = 'info') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const icons = { success: 'check', error: 'x', info: 'info' };
  el.innerHTML = `<span class="t-icon ${kind}">${icon(icons[kind] || 'info', 14, 2.2)}</span><span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, kind === 'error' ? 6000 : 3200);
}

// off-white pill 按钮：双层 label roll-up hover
export function pill(label, { cls = '', attrs = '', ic = '' } = {}) {
  const inner = `${ic ? icon(ic, 13) : ''}${esc(label)}`;
  return `<button class="pill ${cls}" ${attrs}><span class="roll"><span>${inner}</span><span aria-hidden="true">${inner}</span></span></button>`;
}

// 通用模态框：actions = [{label, kind, onClick(close)}]
export function modal({ title, body, actions = [], wide = false }) {
  const root = document.getElementById('modal-root');
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" ${wide ? 'style="width:min(720px,calc(100vw - 40px))"' : ''}>
      <div class="modal-head">${esc(title)}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"></div>
    </div>`;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  const foot = mask.querySelector('.modal-foot');
  for (const a of actions) {
    let btn;
    if (a.kind === 'primary' || a.kind === 'danger') {
      const wrap = document.createElement('div');
      wrap.innerHTML = pill(a.label, { cls: a.kind === 'danger' ? 'danger' : '' });
      btn = wrap.firstElementChild;
    } else {
      btn = document.createElement('button');
      btn.className = `btn ${a.kind || ''}`;
      btn.textContent = a.label;
    }
    btn.addEventListener('click', () => a.onClick(close, mask));
    foot.appendChild(btn);
  }
  root.appendChild(mask);
  const firstInput = mask.querySelector('input,textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);
  return { close, mask };
}

export function confirmModal({ title, message, confirmLabel = '确认', danger = false, onConfirm }) {
  modal({
    title,
    body: `<div>${message}</div>`,
    actions: [
      { label: '取消', kind: 'ghost', onClick: (close) => close() },
      {
        label: confirmLabel, kind: danger ? 'danger' : 'primary',
        onClick: async (close) => { close(); await onConfirm(); },
      },
    ],
  });
}

// 带输入框的模态框
export function promptModal({ title, label, placeholder = '', value = '', confirmLabel = '确定', onConfirm }) {
  const { mask } = modal({
    title,
    body: `
      <div class="form-field">
        <label>${esc(label)}</label>
        <input type="text" id="modal-input" placeholder="${esc(placeholder)}" value="${esc(value)}">
      </div>`,
    actions: [
      { label: '取消', kind: 'ghost', onClick: (close) => close() },
      {
        label: confirmLabel, kind: 'primary',
        onClick: async (close) => {
          const v = mask.querySelector('#modal-input').value.trim();
          if (!v) { toast('内容不能为空', 'error'); return; }
          close();
          await onConfirm(v);
        },
      },
    ],
  });
  mask.querySelector('#modal-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') mask.querySelector('.modal-foot .pill')?.click();
  });
}

export function outputModal(title, output, ok) {
  modal({
    title: `${title} ${ok ? '完成' : '失败'}`,
    wide: true,
    body: `<pre>${esc(output || '（无输出）')}</pre>`,
    actions: [{ label: '关闭', kind: 'primary', onClick: (close) => close() }],
  });
}

// PyCharm 式 refs 彩色标签簇：类型着色小 tag 图标 + 精简摘要，悬浮罗列全名
export function refMeta(ref, remoteNames = []) {
  if (ref === 'HEAD' || ref.startsWith('HEAD -> ')) return { kind: 'head', label: 'HEAD', full: ref === 'HEAD' ? 'HEAD' : ref.slice(8) };
  if (ref.startsWith('tag: ')) return { kind: 'tag', label: ref.slice(5), full: ref.slice(5) };
  const r = remoteNames.find((n) => ref.startsWith(`${n}/`));
  if (r) return { kind: 'remote', label: r, full: ref };
  return { kind: 'local', label: ref, full: ref };
}

export function refCluster(refs, remoteNames = []) {
  if (!refs.length) return '';
  const metas = refs.map((r) => refMeta(r, remoteNames));
  const icons = metas.map((m) => `<span class="ref-ic ${m.kind}">${icon('tag', 13, 1.7)}</span>`).join('');
  return `<span class="ref-cluster" data-refs="${esc(JSON.stringify(metas))}">${icons}</span>`;
}

let refPop = null;
function hideRefPop() {
  refPop?.remove();
  refPop = null;
}
export function bindRefClusters(root) {
  root.querySelectorAll('.ref-cluster').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      hideRefPop();
      const metas = JSON.parse(el.dataset.refs);
      refPop = document.createElement('div');
      refPop.className = 'ref-pop';
      refPop.innerHTML = metas.map((m) => `<span class="ref-pop-row"><span class="ref-ic ${m.kind}">${icon('tag', 12, 2)}</span>${esc(m.full)}</span>`).join('');
      document.body.appendChild(refPop);
      const b = el.getBoundingClientRect();
      const pb = refPop.getBoundingClientRect();
      refPop.style.left = `${Math.max(8, Math.min(b.x, innerWidth - pb.width - 8))}px`;
      refPop.style.top = `${b.bottom + 6 + pb.height > innerHeight ? b.top - pb.height - 6 : b.bottom + 6}px`;
    });
    el.addEventListener('mouseleave', hideRefPop);
  });
}

// 右键上下文菜单：items = [{label, icon, hint, disabled, danger, onClick}] 或 '-' 分隔线
export function contextMenu(items, x, y) {
  document.querySelector('.ctx-menu')?.remove();
  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.innerHTML = items.map((it) => it === '-'
    ? '<div class="ctx-sep"></div>'
    : `<button class="ctx-item ${it.disabled ? 'disabled' : ''} ${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon, 13, 2) : ''}<span>${esc(it.label)}</span>${it.hint ? `<span class="ctx-hint">${esc(it.hint)}</span>` : ''}</button>`).join('');
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
  const close = () => {
    el.remove();
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', close);
  };
  const onDoc = (e) => { if (!el.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('blur', close);
  const actionable = items.filter((it) => it !== '-');
  el.querySelectorAll('.ctx-item').forEach((b, i) => {
    b.addEventListener('click', () => { close(); actionable[i].onClick?.(); });
  });
  return close;
}