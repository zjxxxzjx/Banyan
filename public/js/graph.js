// 提交图：lane 分配 + 每行 SVG 渲染
const PALETTE = ['var(--lane-1)', 'var(--lane-2)', 'var(--lane-3)', 'var(--lane-4)', 'var(--lane-5)', 'var(--lane-6)'];
const ROW_H = 44;
const LANE_W = 16;
const PAD = 14;

export function buildGraph(commits) {
  const lanes = [];
  let colorIdx = 0;
  const nextColor = () => PALETTE[colorIdx++ % PALETTE.length];
  const freeSlot = () => {
    let i = lanes.findIndex((l) => !l);
    if (i === -1) { i = lanes.length; lanes.push(null); }
    return i;
  };
  const rows = [];
  let maxLane = 0;

  for (const c of commits) {
    let lane = lanes.findIndex((l) => l && l.sha === c.sha);
    let color;
    if (lane === -1) {
      lane = freeSlot();
      color = nextColor();
      lanes[lane] = { sha: c.sha, color };
    } else {
      color = lanes[lane].color;
    }
    // 多条 lane 指向同一提交时并入当前 lane
    const dups = [];
    lanes.forEach((l, i) => {
      if (i !== lane && l && l.sha === c.sha) {
        dups.push({ lane: i, color: l.color });
        lanes[i] = null;
      }
    });
    const top = lanes.map((l, i) => (l ? { lane: i, color: l.color } : null)).filter(Boolean);

    lanes[lane] = null;
    const edges = [];
    c.parents.forEach((p, pi) => {
      let pl = lanes.findIndex((l) => l && l.sha === p);
      let pcolor;
      if (pl === -1) {
        pl = freeSlot();
        pcolor = pi === 0 ? color : nextColor();
        lanes[pl] = { sha: p, color: pcolor };
      } else {
        pcolor = lanes[pl].color;
      }
      edges.push({ to: pl, color: pi === 0 ? color : pcolor });
    });
    const bottom = lanes.map((l, i) => (l ? { lane: i, color: l.color } : null)).filter(Boolean);

    rows.push({ sha: c.sha, lane, color, top, bottom, dups, edges, merge: c.parents.length > 1 });
    maxLane = Math.max(maxLane, lanes.length);
    while (lanes.length && !lanes[lanes.length - 1]) lanes.pop();
  }
  return { rows, width: PAD * 2 + Math.max(maxLane, 1) * LANE_W };
}

const x = (lane) => PAD + lane * LANE_W;
const MID = ROW_H / 2;

export function rowSvg(row, width) {
  const parts = [];
  const line = (x1, y1, x2, y2, color) =>
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"/>`);
  const curve = (x0, y0, x1, y1, color) =>
    parts.push(`<path d="M ${x0} ${y0} C ${x0} ${y0 + (y1 - y0) * 0.6}, ${x1} ${y1 - (y1 - y0) * 0.4}, ${x1} ${y1}" fill="none" stroke="${color}" stroke-width="2"/>`);
  const topLanes = new Set(row.top.map((t) => t.lane));
  const dupLanes = new Set(row.dups.map((d) => d.lane));
  // 父提交泳道在本行上方已存在：泳道整行贯通，合并曲线在行中汇入（PyCharm 语义，避免断头线）
  const mergeIn = new Set(row.edges.filter((e) => e.to !== row.lane && topLanes.has(e.to)).map((e) => e.to));
  const edgeTargets = new Set(row.edges.map((e) => e.to));

  // 上半段：进入本行的竖线；mergeIn 泳道直接贯通整行
  for (const t of row.top) {
    if (dupLanes.has(t.lane)) continue;
    if (mergeIn.has(t.lane)) line(x(t.lane), 0, x(t.lane), ROW_H, t.color);
    else line(x(t.lane), 0, x(t.lane), MID, t.color);
  }
  // 并入本提交后消亡的泳道曲线
  for (const d of row.dups) {
    parts.push(`<path d="M ${x(d.lane)} 0 C ${x(d.lane)} ${MID * 0.7}, ${x(row.lane)} ${MID * 0.4}, ${x(row.lane)} ${MID}" fill="none" stroke="${d.color}" stroke-width="2"/>`);
  }
  // 下半段：延续竖线（新父泳道由曲线覆盖、mergeIn 已贯通、首父由 edges 画）
  for (const b of row.bottom) {
    if (edgeTargets.has(b.lane) || mergeIn.has(b.lane)) continue;
    line(x(b.lane), MID, x(b.lane), ROW_H, b.color);
  }
  // 指向父提交的连线
  for (const e of row.edges) {
    if (e.to === row.lane) line(x(row.lane), MID, x(e.to), ROW_H, e.color);
    else if (mergeIn.has(e.to)) curve(x(row.lane), MID, x(e.to), MID, e.color);
    else curve(x(row.lane), MID, x(e.to), ROW_H, e.color);
  }
  // 提交圆点
  const cx = x(row.lane);
  if (row.merge) {
    parts.push(`<circle cx="${cx}" cy="${MID}" r="5" fill="var(--bg)" stroke="${row.color}" stroke-width="2.5"/>`);
  } else {
    parts.push(`<circle cx="${cx}" cy="${MID}" r="4.5" fill="${row.color}"/>`);
  }
  return `<svg class="commit-graph" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}">${parts.join('')}</svg>`;
}