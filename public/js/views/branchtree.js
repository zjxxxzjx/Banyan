import { esc } from '../util.js';
import { icon } from '../icons.js';

// PyCharm 式分支树：HEAD / 本地 / 远程分组，斜杠前缀折叠文件夹，ahead/behind 徽章
function nest(items) {
  const root = { folders: new Map(), leaves: [] };
  for (const item of items) {
    const parts = item.label.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.folders.has(parts[i])) node.folders.set(parts[i], { folders: new Map(), leaves: [] });
      node = node.folders.get(parts[i]);
    }
    node.leaves.push(item);
  }
  return root;
}

function abBadge(b) {
  if (!b.upstream || (!b.ahead && !b.behind)) return '';
  return `<span class="bt-ab">${b.ahead ? `↑${b.ahead}` : ''}${b.behind ? `↓${b.behind}` : ''}</span>`;
}

function rowHtml(b, label, depth, selected, actions) {
  return `
    <div class="bt-row ${b.current ? 'current' : ''} ${selected === b.name ? 'selected' : ''}" data-branch="${esc(b.name)}" data-kind="${b.remote ? 'remote' : 'local'}" style="padding-left:${10 + depth * 14}px">
      ${icon(b.current ? 'tag' : 'branch', 13, 2)}
      <span class="bt-name" title="${esc(b.name)}">${esc(label)}</span>
      ${b.gone ? '<span class="badge-ref">gone</span>' : ''}
      ${abBadge(b)}
      <span class="bt-actions">${actions ? actions(b) : ''}</span>
    </div>`;
}

function groupHtml(key, title, count, depth, collapsed, inner) {
  return `
    <div class="bt-group" data-treekey="${esc(key)}" style="padding-left:${10 + depth * 14}px">
      <span class="bt-chev ${collapsed ? 'closed' : ''}">${icon('chevron', 12, 2)}</span>
      ${icon('folder', 13, 2)}
      <span class="bt-name">${esc(title)}</span>
      <span class="bt-count">${count}</span>
    </div>
    ${collapsed ? '' : inner}`;
}

function renderNode(node, keyPrefix, depth, state, selected, actions) {
  let html = '';
  for (const [name, child] of node.folders) {
    const key = `${keyPrefix}/${name}`;
    const count = child.leaves.length + [...child.folders.values()].reduce((n, c) => n + c.leaves.length, 0);
    html += groupHtml(key, name, count, depth, state.treeCollapsed.includes(key),
      renderNode(child, key, depth + 1, state, selected, actions));
  }
  for (const item of node.leaves) html += rowHtml(item.b, item.label, depth, selected, actions);
  return html;
}

export function renderTree(state, { selected = null, actions = null } = {}) {
  const collapsed = (k) => state.treeCollapsed.includes(k);
  const current = state.branches.find((b) => b.current);
  const locals = state.branches.filter((b) => !b.remote);
  const remotes = state.branches.filter((b) => b.remote);

  let html = `<div class="bt-head micro">HEAD（当前分支）</div>`;
  html += current
    ? rowHtml(current, current.name, 0, selected, actions)
    : '<div class="faint bt-empty">初始提交前</div>';

  const localNode = nest(locals.map((b) => ({ label: b.name, b })));
  html += groupHtml('local', '本地', locals.length, 0, collapsed('local'),
    renderNode(localNode, 'local', 1, state, selected, actions) || '<div class="faint bt-empty">暂无本地分支</div>');

  const remoteNames = state.remotes.map((r) => r.name);
  for (const rn of remoteNames) {
    const items = remotes.filter((b) => b.name.startsWith(`${rn}/`))
      .map((b) => ({ label: b.name.slice(rn.length + 1), b }));
    const key = `remote:${rn}`;
    html += groupHtml(key, rn, items.length, 0, collapsed(key),
      renderNode(nest(items), key, 1, state, selected, actions) || '<div class="faint bt-empty">暂无远程分支</div>');
  }
  const orphan = remotes.filter((b) => !remoteNames.some((rn) => b.name.startsWith(`${rn}/`)));
  if (orphan.length) {
    html += groupHtml('remote:other', '其他远程', orphan.length, 0, collapsed('remote:other'),
      renderNode(nest(orphan.map((b) => ({ label: b.name, b }))), 'remote:other', 1, state, selected, actions));
  }
  return html;
}

export function bindTree(root, ctx, { onSelect, onContext }) {
  root.querySelectorAll('.bt-group').forEach((g) => {
    g.addEventListener('click', () => {
      const key = g.dataset.treekey;
      const i = ctx.state.treeCollapsed.indexOf(key);
      if (i === -1) ctx.state.treeCollapsed.push(key);
      else ctx.state.treeCollapsed.splice(i, 1);
      ctx.renderAll();
    });
  });
  root.querySelectorAll('.bt-row').forEach((r) => {
    r.addEventListener('click', (e) => {
      if (e.target.closest('.bt-actions')) return;
      onSelect(r.dataset.branch, r.dataset.kind);
    });
    if (onContext) {
      r.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onContext(r.dataset.branch, r.dataset.kind, e.clientX, e.clientY);
      });
    }
  });
}