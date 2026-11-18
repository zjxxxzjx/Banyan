// 提交图：lane 分配 + 整列单 SVG（点连点，PyCharm 语义）
const PALETTE = ['var(--lane-1)', 'var(--lane-2)', 'var(--lane-3)', 'var(--lane-4)', 'var(--lane-5)', 'var(--lane-6)'];
const ROW_H = 44;
const LANE_W = 16;
const PAD = 14;

export function buildGraph(commits, { headSha = null } = {}) {
  const indexOf = new Map(commits.map((c, i) => [c.sha, i]));
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

  commits.forEach((c, i) => {
    let lane = lanes.findIndex((l) => l && l.sha === c.sha);
    let color;
    if (lane === -1) {
      lane = freeSlot();
      color = nextColor();
      lanes[lane] = { sha: c.sha, color };
    } else {
      color = lanes[lane].color;
    }
    // 多条 lane 指向同一提交时并入当前 lane（曲线汇聚到该提交圆点）
    lanes.forEach((l, k) => {
      if (k !== lane && l && l.sha === c.sha) lanes[k] = null;
    });
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
      // 父提交在加载窗口外时连线画出底边
      const parentRow = indexOf.has(p) ? indexOf.get(p) : commits.length;
      edges.push({ to: pl, color: pi === 0 ? color : pcolor, parentRow });
    });
    rows.push({ sha: c.sha, lane, color, edges, merge: c.parents.length > 1, head: c.sha === headSha });
    maxLane = Math.max(maxLane, lanes.length);
    while (lanes.length && !lanes[lanes.length - 1]) lanes.pop();
  });
  return { rows, width: PAD * 2 + Math.max(maxLane, 1) * LANE_W, height: commits.length * ROW_H };
}

const X = (lane) => PAD + lane * LANE_W;
const Y = (row) => row * ROW_H + ROW_H / 2;

export function graphSvg(graph) {
  const parts = [];
  // 连线贴泳道（PyCharm 语义）：子圆点 → 一行内汇入父泳道 → 沿泳道竖直下行至父圆点
  graph.rows.forEach((row, i) => {
    for (const e of row.edges) {
      const x0 = X(row.lane), y0 = Y(i);
      const x1 = X(e.to);
      const y1 = e.parentRow >= graph.rows.length ? graph.height : Y(e.parentRow);
      if (x0 === x1) {
        parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${e.color}" stroke-width="2"/>`);
      } else if (e.parentRow === i + 1) {
        const dy = (y1 - y0) * 0.5;
        parts.push(`<path d="M ${x0} ${y0} C ${x0} ${y0 + dy}, ${x1} ${y1 - dy}, ${x1} ${y1}" fill="none" stroke="${e.color}" stroke-width="2"/>`);
      } else {
        const yj = Y(i + 1);
        const dy = (yj - y0) * 0.5;
        parts.push(`<path d="M ${x0} ${y0} C ${x0} ${y0 + dy}, ${x1} ${yj - dy}, ${x1} ${yj}" fill="none" stroke="${e.color}" stroke-width="2"/>`);
        parts.push(`<line x1="${x1}" y1="${yj}" x2="${x1}" y2="${y1}" stroke="${e.color}" stroke-width="2"/>`);
      }
    }
  });
  // 圆点盖在线之上；HEAD 提交双圈标记
  graph.rows.forEach((row, i) => {
    const cx = X(row.lane), cy = Y(i);
    if (row.head && !row.merge) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="7" fill="var(--bg)" stroke="${row.color}" stroke-width="2"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="${row.color}"/>`);
    } else if (row.merge) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="var(--bg)" stroke="${row.color}" stroke-width="2.5"/>`);
      if (row.head) parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${row.color}"/>`);
    } else {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="4.5" fill="${row.color}"/>`);
    }
  });
  return `<svg class="commit-graph-overlay" width="${graph.width}" height="${graph.height}" viewBox="0 0 ${graph.width} ${graph.height}">${parts.join('')}</svg>`;
}