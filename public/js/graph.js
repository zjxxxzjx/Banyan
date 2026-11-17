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
  const edgeTargets = new Set(row.edges.map((e) => e.to));
  // 上半段：进入本行的竖线
  for (const t of row.top) {
    if (t.lane === row.lane) {
      parts.push(`<line x1="${x(t.lane)}" y1="0" x2="${x(t.lane)}" y2="${MID}" stroke="${t.color}" stroke-width="2"/>`);
    } else if (!row.dups.some((d) => d.lane === t.lane)) {
      parts.push(`<line x1="${x(t.lane)}" y1="0" x2="${x(t.lane)}" y2="${MID}" stroke="${t.color}" stroke-width="2"/>`);
    }
  }
  // 并入的分支曲线
  for (const d of row.dups) {
    parts.push(`<path d="M ${x(d.lane)} 0 C ${x(d.lane)} ${MID * 0.7}, ${x(row.lane)} ${MID * 0.4}, ${x(row.lane)} ${MID}" fill="none" stroke="${d.color}" stroke-width="2"/>`);
  }
  // 下半段：延续的竖线（父提交连线单独画）
  for (const b of row.bottom) {
    if (!edgeTargets.has(b.lane)) {
      parts.push(`<line x1="${x(b.lane)}" y1="${MID}" x2="${x(b.lane)}" y2="${ROW_H}" stroke="${b.color}" stroke-width="2"/>`);
    }
  }
  // 指向父提交的连线
  for (const e of row.edges) {
    if (e.to === row.lane) {
      parts.push(`<line x1="${x(row.lane)}" y1="${MID}" x2="${x(e.to)}" y2="${ROW_H}" stroke="${e.color}" stroke-width="2"/>`);
    } else {
      parts.push(`<path d="M ${x(row.lane)} ${MID} C ${x(row.lane)} ${MID + (ROW_H - MID) * 0.6}, ${x(e.to)} ${MID + (ROW_H - MID) * 0.4}, ${x(e.to)} ${ROW_H}" fill="none" stroke="${e.color}" stroke-width="2"/>`);
    }
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