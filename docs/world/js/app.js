/* 世界历史跨度图 —— 渲染与交互
 * 数据: window.WORLD_DATA (docs/world/data.js)
 * 坐标系: 纵轴=时间(每行10年), 横轴=地理(区域×列)
 * 渲染骨架与中国版 (docs/js/app.js) 相同, 两者各自独立维护
 */
"use strict";

const DATA = window.WORLD_DATA;
const M = DATA.meta;
const SVGNS = "http://www.w3.org/2000/svg";
const STRIDE = 128; // 格子编号 = 行 * STRIDE + 列, 列数必须小于 STRIDE

/* ---------- 区域与列 ---------- */
{
  let c = 0;
  for (const rg of DATA.regions) {
    rg.c0 = c;
    rg.c1 = c + rg.cols - 1;
    c += rg.cols;
  }
  M.cols = c;
}
const REGION = Object.fromEntries(DATA.regions.map((rg) => [rg.key, rg]));
const regionOfCol = (c) => DATA.regions.find((rg) => c >= rg.c0 && c <= rg.c1);

/* ---------- 缩放档位 ---------- */
const ZOOMS = [
  { rowH: 7,  colW: 12, fs: 11 },   // 概览
  { rowH: 12, colW: 20, fs: 14 },   // 默认
  { rowH: 20, colW: 28, fs: 17 },   // 细看
];
let zoom = window.innerWidth < 700 ? 0 : 1;

/* ---------- 列布局: 等宽 / 按面积 ---------- */
/* equal: 每列同宽 (默认); area: 列宽与该列代表地区面积 (regions[].area) 的平方根成正比
 * (纯面积比例差距达数千倍, 西欧、地中海会被压成细条; 平方根保留大小关系又不失可读性) */
const AREA_MIN_W = 3; // 按面积时细列的最小宽度 (px), 保证仍可悬停
let layout = "equal";
let colX = [];        // colX[c] = 第 c 列左边界, colX[M.cols] = 总宽
const AREAS = DATA.regions.flatMap((rg) => rg.area.map(Math.sqrt));
/* 把总宽 W 按权重 AREAS 分给各列; 不足最小宽度的列取最小宽度, 余下按比例重分 */
function areaWidths(W) {
  const fixed = new Set();
  let widths;
  for (;;) {
    const rest = AREAS.reduce((s, a, c) => s + (fixed.has(c) ? 0 : a), 0);
    const scale = (W - fixed.size * AREA_MIN_W) / rest;
    widths = AREAS.map((a, c) => (fixed.has(c) ? AREA_MIN_W : a * scale));
    const small = widths.findIndex((w, c) => !fixed.has(c) && w < AREA_MIN_W);
    if (small < 0) return widths;
    widths.forEach((w, c) => { if (w < AREA_MIN_W) fixed.add(c); });
  }
}

const AXIS_W = () => (window.innerWidth < 700 ? 40 : 52);
const HEAD_H = 38;

/* ---------- 时代导航 ---------- */
const NAV = [
  ["文明曙光", -3500], ["青铜时代", -2500], ["轴心时代", -800], ["罗马与汉", -200],
  ["古典晚期", 300], ["伊斯兰兴起", 620], ["中世纪盛期", 1000], ["蒙古时代", 1200],
  ["大航海", 1450], ["革命时代", 1750], ["世界大战", 1900], ["当代", 1950],
];
/* 时代分界虚线 */
const ERA_LINES = [
  [-3200, "文字出现"], [-776, "首届奥运"], [-221, "秦统一"], [-27, "罗马帝国"],
  [476, "西罗马亡"], [622, "伊斯兰历元"], [1206, "蒙古崛起"], [1453, "君堡陷落"],
  [1492, "哥伦布"], [1789, "法国大革命"], [1914, "一战"], [1945, "二战结束"],
];

/* ---------- 工具 ---------- */
const $ = (s) => document.querySelector(s);
const NOW = new Date().getFullYear();
const GRID_END = M.yearStart + M.rows * M.yearStep;
/* 不预测未来: 网格与色块在当前年份截止, 仍存续的政权显示「今」 */
const END_ROW = Math.min(M.rows, (NOW - M.yearStart) / M.yearStep);
const fmtYear = (y) => (y < 0 ? `前${-y}` : y === 0 ? "公元元年" : `${y}`);
const fmtYearFull = (y) => (y < 0 ? `公元前${-y}年` : y === 0 ? "公元元年" : `公元${y}年`);
/* ex=[起, 止]: 止为 null 表示至今; ap 位标记约数 (1=起, 2=止) */
const isOngoing = (p) => p.ex[1] === null;
const approx = (p, side) => ((p.ap || 0) & (side === 0 ? 1 : 2)) !== 0;
const exSide = (p, side, short) => {
  const v = p.ex[side];
  if (v === null) return "今";
  const s = short ? fmtYear(v) : fmtYearFull(v);
  return approx(p, side) ? `约${s}` : s;
};
const yearsText = (p) => `${exSide(p, 0)} — ${exSide(p, 1)}`;
const yearsTextShort = (p) => `${exSide(p, 0, true)}–${exSide(p, 1, true)}`;
const durText = (p) => {
  const [s, e] = p.ex;
  const pre = p.ap ? "约" : "";
  if (e === null) return `至今${pre}${NOW - s}年`;
  return `${pre}${e - s - (s < 0 && e > 0 ? 1 : 0)}年`;
};
const yearToRow = (y) => (y - M.yearStart) / M.yearStep;
const snapRow = (y) => Math.round(yearToRow(y));

function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (x) => Math.round(((n >> x) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const L = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return L > 150;
}

/* ---------- 数据展开: 位置字符串 -> 列, 时间段 -> 行程 ---------- */
function endpoint(s, isEnd) {
  const [key, sub] = s.split(":");
  const rg = REGION[key];
  if (!rg) throw new Error(`未知区域: ${key}`);
  if (sub === undefined) return isEnd ? rg.c1 : rg.c0;
  const [a, b] = sub.split("-").map(Number);
  return rg.c0 + (isEnd ? (b ?? a) : a);
}
function parseWhere(s) {
  const [a, b] = s.split("~");
  return [endpoint(a, false), endpoint(b ?? a, true)];
}
DATA.polities.forEach((p, id) => {
  p.id = id;
  p.name = p.n;
  const segs = p.s || [[p.ex[0], p.ex[1] ?? GRID_END, p.w]];
  p.rects = [];  // [r0, c0, r1, c1] 闭区间
  p.runs = [];
  for (const [y0, y1, wh] of segs) {
    const [c0, c1] = parseWhere(wh);
    const r0 = Math.max(0, snapRow(y0));
    const r1 = Math.min(M.rows, Math.max(snapRow(y0) + 1, snapRow(y1)));
    if (r1 <= r0) continue;
    p.rects.push([r0, c0, r1 - 1, c1]);
    for (let r = r0; r < r1; r++) p.runs.push([r, c0, c1]);
  }
  p.y0 = M.yearStart + Math.min(...p.rects.map((x) => x[0])) * M.yearStep;
  p.y1 = M.yearStart + (Math.max(...p.rects.map((x) => x[2])) + 1) * M.yearStep;
  const cols = new Set();
  for (const [, c0, c1] of p.runs) for (let c = c0; c <= c1; c++) cols.add(c);
  p.regions = DATA.regions.filter((rg) => [...cols].some((c) => c >= rg.c0 && c <= rg.c1))
    .map((rg) => rg.name);
});

/* ---------- 政权几何: 由格子集合描出轮廓 ---------- */
function cellSet(runs) {
  const s = new Set();
  for (const [r, c0, c1] of runs) for (let c = c0; c <= c1; c++) s.add(r * STRIDE + c);
  return s;
}
/* 返回若干闭合环, 每环为 [x,y] 网格顶点序列 (顺时针, 屏幕坐标 y 向下) */
function traceOutline(cells) {
  const key = (x, y) => y * STRIDE + x;
  const edges = new Map(); // startVertex -> [{x2,y2,dir}]
  const addEdge = (x1, y1, x2, y2, dir) => {
    const k = key(x1, y1);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ x: x2, y: y2, dir });
  };
  for (const id of cells) {
    const r = Math.floor(id / STRIDE), c = id % STRIDE;
    if (!cells.has((r - 1) * STRIDE + c)) addEdge(c, r, c + 1, r, 0);       // 上边 →
    if (!cells.has(r * STRIDE + c + 1)) addEdge(c + 1, r, c + 1, r + 1, 1); // 右边 ↓
    if (!cells.has((r + 1) * STRIDE + c)) addEdge(c + 1, r + 1, c, r + 1, 2); // 下边 ←
    if (!cells.has(r * STRIDE + c - 1)) addEdge(c, r + 1, c, r, 3);         // 左边 ↑
  }
  const loops = [];
  for (const [startK, list] of edges) {
    while (list.length) {
      const first = list.pop();
      let x = startK % STRIDE, y = Math.floor(startK / STRIDE);
      const pts = [[x, y]];
      let cur = first, cx = first.x, cy = first.y, dir = first.dir;
      while (cx !== x || cy !== y) {
        pts.push([cx, cy]);
        const cands = edges.get(key(cx, cy)) || [];
        // 顺时针描边: 优先右转, 其次直行, 再次左转
        let pick = -1;
        for (const want of [(dir + 1) % 4, dir, (dir + 3) % 4]) {
          pick = cands.findIndex((e) => e.dir === want);
          if (pick >= 0) break;
        }
        if (pick < 0) break; // 理论不可达
        cur = cands.splice(pick, 1)[0];
        cx = cur.x; cy = cur.y; dir = cur.dir;
      }
      // 去掉共线点
      const out = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[(i + n - 1) % n], b = pts[i], c2 = pts[(i + 1) % n];
        if ((a[0] === b[0] && b[0] === c2[0]) || (a[1] === b[1] && b[1] === c2[1])) continue;
        out.push(b);
      }
      if (out.length >= 4) loops.push(out);
    }
  }
  return loops;
}
/* 环 -> 圆角 path */
function loopsToPath(loops, X, rowH, rad) {
  let d = "";
  for (const pts of loops) {
    const P = pts.map(([x, y]) => [X[x], y * rowH]);
    const n = P.length;
    const seg = [];
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i + 1) % n];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const r = Math.min(rad, len / 2 - 0.01);
      seg.push({ p, q, r, len });
    }
    for (let i = 0; i < n; i++) {
      const { p, q, len } = seg[i];
      const rIn = seg[i].r, rOut = seg[(i + 1) % n].r;
      const ux = (q[0] - p[0]) / len, uy = (q[1] - p[1]) / len;
      const a = [p[0] + ux * rIn, p[1] + uy * rIn];       // 边起点(离开上一个角)
      const b = [q[0] - ux * rOut, q[1] - uy * rOut];      // 边终点(进入下一个角)
      if (i === 0) d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
      d += `L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      const next = seg[(i + 1) % n];
      const nb = [next.p[0] + ((next.q[0] - next.p[0]) / next.len) * next.r,
                  next.p[1] + ((next.q[1] - next.p[1]) / next.len) * next.r];
      d += `Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${nb[0].toFixed(1)} ${nb[1].toFixed(1)}`;
    }
    d += "Z";
  }
  return d;
}

/* ---------- 预计算: 轮廓 + 标签 ---------- */
/* 连通分量 (4 邻接), 每个分量各放一个标签 */
function components(cells) {
  const seen = new Set(), comps = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const comp = new Set([start]);
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const id = stack.pop();
      for (const nb of [id - STRIDE, id + STRIDE, id - 1, id + 1]) {
        if (cells.has(nb) && !seen.has(nb)) { seen.add(nb); comp.add(nb); stack.push(nb); }
      }
    }
    comps.push(comp);
  }
  return comps;
}
for (const p of DATA.polities) {
  p.cells = cellSet(p.runs);
  p.loops = traceOutline(p.cells);
  p.dispName = p.name;
  // 标签文字: 去掉括号注
  p.labelText = p.name.replace(/（[^）]*）/g, "") || p.name;
  // 每个连通分量取面积最大的那段矩形作标签框
  p.labels = components(p.cells).map((comp) => {
    let best = null, bestA = -1;
    for (const rc of p.rects) {
      if (!comp.has(rc[0] * STRIDE + rc[1])) continue;
      const a = (rc[2] - rc[0] + 1) * (rc[3] - rc[1] + 1);
      if (a > bestA) { best = rc; bestA = a; }
    }
    return best;
  }).filter(Boolean).sort((a, b) =>
    (b[2] - b[0] + 1) * (b[3] - b[1] + 1) - (a[2] - a[0] + 1) * (a[3] - a[1] + 1));
  // 每个标签的可跟随范围: 该标签列带上, 政权连续占据的行区间
  p.labelSpans = p.labels.map(([r0, c0, r1, c1]) => {
    const colHit = (r) => {
      for (let c = c0; c <= c1; c++) if (p.cells.has(r * STRIDE + c)) return true;
      return false;
    };
    let ys = r0, ye = r1;
    while (ys > 0 && colHit(ys - 1)) ys--;
    while (ye < M.rows - 1 && colHit(ye + 1)) ye++;
    return [ys, ye];
  });
}

/* ---------- 自动着色: 相邻政权不同色 ---------- */
const PALETTE = [
  "#ee8a4f", "#4f74c4", "#8ccaa0", "#f5b48f", "#d9483c", "#4ea89d",
  "#f1c453", "#7fa2dd", "#a687cf", "#b7cd70", "#e3869e", "#6fb9d6",
];
{
  const owner = new Map();
  for (const p of DATA.polities) for (const id of p.cells) owner.set(id, p.id);
  const nbrs = DATA.polities.map(() => new Set());
  for (const p of DATA.polities) {
    for (const id of p.cells) {
      for (const nb of [id - STRIDE, id + STRIDE, id - 1, id + 1, id - STRIDE - 1, id - STRIDE + 1, id + STRIDE - 1, id + STRIDE + 1]) {
        const o = owner.get(nb);
        if (o !== undefined && o !== p.id) nbrs[p.id].add(o);
      }
    }
  }
  // 名字哈希决定首选色, 让配色稳定且不随条目顺序剧烈变化
  const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7);
  const order = [...DATA.polities].sort((a, b) => b.cells.size - a.cells.size);
  for (const p of order) {
    if (p.c !== undefined) { p.color = PALETTE[p.c]; continue; }
    const used = new Set([...nbrs[p.id]].map((q) => DATA.polities[q].color).filter(Boolean));
    const start = hash(p.name) % PALETTE.length;
    for (let k = 0; k < PALETTE.length; k++) {
      const col = PALETTE[(start + k) % PALETTE.length];
      if (!used.has(col)) { p.color = col; break; }
    }
    p.color ||= PALETTE[start];
  }
}

/* ---------- 渲染 ---------- */
const scroller = $("#scroller");
const canvas = $("#canvas");
const chartWrap = $("#chart-wrap");
let svg = null;
let labelEls = [];  // 跟随滚动的标签及其原始位置/可移动范围
let selected = null;

let curW = 0; // 图表实际总宽 (宽屏下自适应铺满)
const colLeft = (c) => colX[c];
const spanW = (c0, c1) => colX[c1 + 1] - colX[c0];
function render() {
  const { rowH, fs } = ZOOMS[zoom];
  const axw = AXIS_W();
  // 两种布局总宽相同: 等宽布局的列宽乘列数
  const colW = Math.max(ZOOMS[zoom].colW,
    Math.floor((scroller.clientWidth - 2 * axw) / M.cols));
  const W = M.cols * colW, H = END_ROW * rowH;
  const widths = layout === "area" ? areaWidths(W) : AREAS.map(() => colW);
  colX = [0];
  for (const w of widths) colX.push(colX[colX.length - 1] + w);
  curW = W;

  canvas.style.gridTemplateColumns = `${axw}px ${W}px ${axw}px`;
  canvas.style.gridTemplateRows = `${HEAD_H}px ${H}px`;

  /* 区域表头 */
  const head = $("#colhead");
  head.innerHTML = "";
  DATA.regions.forEach((rg, i) => {
    const div = document.createElement("div");
    div.className = "region" + (i % 2 ? " alt" : "");
    // 按面积布局下太窄的区域放不下名字, 只留悬停提示
    if (layout === "equal" || spanW(rg.c0, rg.c1) >= rg.name.length * 11 + 2) div.textContent = rg.name;
    div.title = `${rg.name} · ${rg.en}`;
    div.style.left = colLeft(rg.c0) + "px";
    div.style.width = spanW(rg.c0, rg.c1) + "px";
    head.appendChild(div);
  });

  /* 年份轴 (左右) */
  for (const id of ["#axis-l", "#axis-r"]) {
    const ax = $(id);
    ax.innerHTML = "";
    const step = rowH >= 12 ? 100 : 200; // 标注间隔(年)
    for (let y = Math.ceil(M.yearStart / step) * step; y < NOW - 20; y += step) {
      const div = document.createElement("div");
      div.className = "tick" + (y % 500 === 0 ? " major" : "");
      div.textContent = fmtYear(y);
      div.style.top = yearToRow(y) * rowH + "px";
      ax.appendChild(div);
    }
    const nowTick = document.createElement("div");
    nowTick.className = "tick major now";
    nowTick.textContent = "今";
    nowTick.style.top = yearToRow(NOW) * rowH + "px";
    ax.appendChild(nowTick);
    for (const [y, label] of ERA_LINES) {
      const div = document.createElement("div");
      div.className = "era-tick";
      div.textContent = label;
      div.style.top = yearToRow(y) * rowH + "px";
      ax.appendChild(div);
    }
  }

  /* SVG 主体 */
  svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // 区域底色相间 + 分隔线
  const bg = document.createElementNS(SVGNS, "g");
  DATA.regions.forEach((rg, i) => {
    if (i % 2) {
      const rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", colLeft(rg.c0));
      rect.setAttribute("width", spanW(rg.c0, rg.c1));
      rect.setAttribute("y", 0);
      rect.setAttribute("height", H);
      rect.setAttribute("class", "region-shade");
      bg.appendChild(rect);
    }
    if (i > 0) {
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", colLeft(rg.c0)); ln.setAttribute("x2", colLeft(rg.c0));
      ln.setAttribute("y1", 0); ln.setAttribute("y2", H);
      ln.setAttribute("class", "region-sep");
      bg.appendChild(ln);
    }
  });
  // 世纪横线
  for (let y = Math.ceil(M.yearStart / 100) * 100; y < NOW; y += 100) {
    const ln = document.createElementNS(SVGNS, "line");
    ln.setAttribute("x1", 0); ln.setAttribute("x2", W);
    const yy = yearToRow(y) * rowH;
    ln.setAttribute("y1", yy); ln.setAttribute("y2", yy);
    ln.setAttribute("class", "gridline" + (y % 500 === 0 ? " major" : ""));
    bg.appendChild(ln);
  }
  // 时代分界虚线 + 「今」线
  for (const [y, , now] of [...ERA_LINES, [NOW, "今", true]]) {
    const ln = document.createElementNS(SVGNS, "line");
    ln.setAttribute("x1", 0); ln.setAttribute("x2", W);
    const yy = yearToRow(y) * rowH - (now ? 0.5 : 0);
    ln.setAttribute("y1", yy); ln.setAttribute("y2", yy);
    ln.setAttribute("class", "era-line" + (now ? " now" : ""));
    bg.appendChild(ln);
  }
  svg.appendChild(bg);

  /* 政权色块 */
  labelEls = [];
  const rad = Math.min(3, rowH / 3);
  for (const p of DATA.polities) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "polity" + (selected === p.id ? " selected" : ""));
    g.dataset.id = p.id;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", loopsToPath(p.loops, colX, rowH, rad));
    path.setAttribute("fill", p.color);
    path.setAttribute("stroke", darken(p.color, 0.6));
    g.appendChild(path);

    p.labels.forEach(([r0, c0, r1, c1], li) => {
      const text = p.labelText;
      const wPx = spanW(c0, c1), hPx = (r1 - r0 + 1) * rowH;
      const horiz = wPx > hPx * 1.4 && text.length > 1;
      let size;
      if (horiz) size = Math.min(fs * 1.15, hPx * 0.8, (wPx - 6) / text.length);
      else size = Math.min(fs, wPx / (c1 - c0 + 1) * 0.72, Math.max(hPx * 0.9 / text.length, 0));
      // 长政权名字号不受高度限制 (可跟随滚动), 短的必须塞得下
      const [ys, ye] = p.labelSpans[li];
      const spanH = (ye - ys + 1) * rowH;
      if (!horiz && size * text.length > spanH) size = spanH * 0.92 / text.length;
      if (size < 7.5) return; // 太小不渲染, 靠悬停提示
      const tx = document.createElementNS(SVGNS, "text");
      tx.setAttribute("class", "lbl" + (isLight(p.color) ? "" : " on-dark"));
      tx.setAttribute("font-size", size.toFixed(1));
      const cx = (colLeft(c0) + colLeft(c1 + 1)) / 2;
      const cy = ((r0 + r1 + 1) / 2) * rowH;
      let h;
      if (horiz) {
        // 横排: 空间够时在中文名下方加一行英文名
        const enSize = Math.min(size * 0.5, (wPx - 6) / Math.max(1, p.en.length) * 1.8);
        const withEn = p.en && hPx > size * 2.4 && enSize >= 6.5;
        tx.setAttribute("x", cx);
        tx.setAttribute("y", withEn ? cy - enSize * 0.55 : cy);
        tx.setAttribute("dominant-baseline", "central");
        tx.textContent = text;
        if (withEn) {
          const en = document.createElementNS(SVGNS, "tspan");
          en.setAttribute("class", "en");
          en.setAttribute("x", cx);
          en.setAttribute("dy", (size * 0.5 + enSize * 0.75).toFixed(1));
          en.setAttribute("font-size", enSize.toFixed(1));
          en.textContent = p.en.toUpperCase();
          tx.appendChild(en);
        }
        h = withEn ? size + enSize * 1.4 : size;
      } else {
        tx.setAttribute("x", cx);
        const totalH = size * text.length;
        [...text].forEach((ch, i) => {
          const ts = document.createElementNS(SVGNS, "tspan");
          ts.setAttribute("x", cx);
          ts.setAttribute("y", cy - totalH / 2 + size * (i + 0.85));
          ts.textContent = ch;
          tx.appendChild(ts);
        });
        h = totalH;
      }
      g.appendChild(tx);
      labelEls.push({
        el: tx, cx, cy, c0, c1, cells: p.cells, rowH, h,
        spanTop: ys * rowH, spanBot: (ye + 1) * rowH,
      });
    });
    svg.appendChild(g);
  }

  chartWrap.innerHTML = "";
  chartWrap.appendChild(svg);
  updateLabels();
  updateYearPill();
  updateNavActive();
}

/* ---------- 标签跟随滚动 ---------- */
function updateLabels() {
  const viewTop = scroller.scrollTop;
  const viewBot = viewTop + scroller.clientHeight - HEAD_H;
  for (const L of labelEls) {
    const vt = Math.max(L.spanTop, viewTop), vb = Math.min(L.spanBot, viewBot);
    let target = L.cy;
    let targetX = L.cx;
    if (vb > vt) {
      target = (vt + vb) / 2;
      const lo = L.spanTop + L.h / 2 + 4, hi = L.spanBot - L.h / 2 - 4;
      if (lo < hi) target = Math.max(lo, Math.min(hi, target));
      else target = L.cy;

      // 标签随年代移动时，原标签矩形所在的列不一定仍被该政权占据，
      // 取目标行中矩形范围内实际有色块的列中心，避免文字漂到轮廓外。
      const row = Math.max(0, Math.min(M.rows - 1, Math.floor(target / L.rowH)));
      let hit0 = null, hit1 = null;
      for (let c = L.c0; c <= L.c1; c++) {
        if (!L.cells.has(row * STRIDE + c)) continue;
        if (hit0 === null) hit0 = c;
        hit1 = c;
      }
      if (hit0 !== null) targetX = (colLeft(hit0) + colLeft(hit1 + 1)) / 2;
    }
    const dx = targetX - L.cx;
    const dy = target - L.cy;
    L.el.setAttribute("transform", Math.abs(dx) > 1 || Math.abs(dy) > 1
      ? `translate(${dx.toFixed(0)} ${dy.toFixed(0)})`
      : "");
  }
}

/* ---------- 年代指示器 ---------- */
const yearPill = $("#year-pill");
let pillTimer = null;
function updateYearPill() {
  const { rowH } = ZOOMS[zoom];
  const centerRow = (scroller.scrollTop + (scroller.clientHeight - HEAD_H) / 2) / rowH;
  const y = Math.round((M.yearStart + centerRow * M.yearStep) / 10) * 10;
  yearPill.textContent = y >= NOW
    ? `今（${NOW}年）`
    : fmtYearFull(Math.max(M.yearStart, y));
  yearPill.hidden = false;
  clearTimeout(pillTimer);
  pillTimer = setTimeout(() => (yearPill.hidden = true), 1200);
}

/* ---------- 导航 ---------- */
const eranav = $("#eranav");
NAV.forEach(([label, y]) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.dataset.year = y;
  b.addEventListener("click", () => scrollToYear(y));
  eranav.appendChild(b);
});
function scrollToYear(y, smooth = true) {
  const { rowH } = ZOOMS[zoom];
  const top = yearToRow(y) * rowH - (scroller.clientHeight - HEAD_H) * 0.18;
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}
function updateNavActive() {
  const { rowH } = ZOOMS[zoom];
  const yTop = M.yearStart + (scroller.scrollTop / rowH) * M.yearStep +
    ((scroller.clientHeight - HEAD_H) / rowH) * M.yearStep * 0.25;
  let active = null;
  for (const b of eranav.children) {
    if (+b.dataset.year <= yTop) active = b;
    b.classList.remove("active");
  }
  if (active) active.classList.add("active");
}

/* ---------- 悬停 ---------- */
const tooltip = $("#tooltip");
let hoverId = null;
chartWrap.addEventListener("pointerover", (e) => {
  const g = e.target.closest("g.polity");
  if (!g) return;
  hoverId = +g.dataset.id;
  svg.classList.add("hovering");
  g.classList.add("hot");
});
chartWrap.addEventListener("pointerout", (e) => {
  const g = e.target.closest("g.polity");
  if (!g) return;
  g.classList.remove("hot");
  svg.classList.remove("hovering");
  hoverId = null;
  tooltip.hidden = true;
});
chartWrap.addEventListener("pointermove", (e) => {
  if (hoverId === null) return;
  const p = DATA.polities[hoverId];
  tooltip.innerHTML =
    `<b>${p.dispName}</b>` +
    (p.en ? `<i>${p.en}</i>` : "") +
    `<span>年代：${yearsText(p)} · ${durText(p)}</span>` +
    `<span>${p.regions.join(" / ")}</span>`;
  tooltip.hidden = false;
  const pad = 14;
  let x = e.clientX + pad, y = e.clientY + pad;
  const r = tooltip.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
});

/* ---------- 点击 -> 详情面板 ---------- */
const panel = $("#panel"), panelBody = $("#panel-body");
chartWrap.addEventListener("click", (e) => {
  const g = e.target.closest("g.polity");
  if (g) openPanel(+g.dataset.id);
});
$("#panel-close").addEventListener("click", closePanel);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

function openPanel(id) {
  const p = DATA.polities[id];
  selected = id;
  svg.querySelectorAll("g.polity.selected").forEach((g) => g.classList.remove("selected"));
  const target = svg.querySelector(`g.polity[data-id="${id}"]`);
  target?.classList.add("selected");
  if (target) {
    const rect = target.getBoundingClientRect();
    panel.classList.toggle("panel-left", rect.left + rect.width / 2 > window.innerWidth / 2);
  }

  // 同期政权: 同区域优先, 其次按时间重叠长度
  const mine = new Set(p.regions);
  const others = DATA.polities
    .filter((q) => q.id !== id && q.y0 < p.y1 && q.y1 > p.y0)
    .map((q) => ({
      q,
      near: q.regions.some((r) => mine.has(r)) ? 1 : 0,
      ov: Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0),
    }))
    .sort((a, b) => b.near - a.near || b.ov - a.ov)
    .slice(0, 16);

  let html = `<h2><span class="swatch" style="background:${p.color}"></span>${p.dispName}</h2>`;
  if (p.en) html += `<p class="en">${p.en}</p>`;
  html += `<p class="years">年代：${yearsText(p)}<em>${durText(p)}</em></p>`;
  html += `<p class="chips">${p.regions.map((r) => `<span>${r}</span>`).join("")}</p>`;
  if (p.i) html += `<p class="intro">${p.i}</p>`;
  if (p.note) html += `<p class="note">📌 ${p.note}</p>`;
  if (others.length) {
    html += `<h3>同期政权</h3><ul class="concurrent">` +
      others.map(({ q }) =>
        `<li data-id="${q.id}"><i style="background:${q.color}"></i>${q.dispName}<small>${yearsTextShort(q)}</small></li>`
      ).join("") + "</ul>";
  }
  html += `<p class="legend">色块只画政权直接统治的核心区；附庸国保留自己的色块，短暂占领、海外殖民地与图外地区不画入。</p>`;
  panelBody.innerHTML = html;
  panel.hidden = false;
  bindPanelLinks();
}
function closePanel() {
  panel.hidden = true;
  selected = null;
  svg?.querySelectorAll("g.polity.selected").forEach((g) => g.classList.remove("selected"));
}

function bindPanelLinks() {
  panelBody.querySelectorAll("li[data-id]").forEach((li) =>
    li.addEventListener("click", () => {
      jumpTo(+li.dataset.id);
      openPanel(+li.dataset.id);
    }));
}

function openSearchResults(matches, query) {
  selected = null;
  panel.classList.remove("panel-left");
  svg?.querySelectorAll("g.polity.selected").forEach((g) => g.classList.remove("selected"));
  panelBody.innerHTML = `<h2>“${query}”的搜索结果</h2>` +
    `<p class="raw">找到 ${matches.length} 个相关条目，请选择。</p>` +
    `<ul class="concurrent search-results">` +
    matches.map((p) =>
      `<li data-id="${p.id}"><i style="background:${p.color}"></i>` +
      `${p.dispName}<small>${yearsTextShort(p)}</small></li>`
    ).join("") + "</ul>";
  panel.hidden = false;
  bindPanelLinks();
}

/* ---------- 跳转 + 闪烁 ---------- */
const flashTimers = new Map();
function jumpTo(id, smooth = true) {
  const p = DATA.polities[id];
  const { rowH } = ZOOMS[zoom];
  const rect = p.labels[0] || p.rects[0];
  const cy = ((rect[0] + rect[2] + 1) / 2) * rowH + HEAD_H;
  const cx = (colLeft(rect[1]) + colLeft(rect[3] + 1)) / 2 + AXIS_W();
  scroller.scrollTo({
    top: Math.max(0, cy - scroller.clientHeight / 2),
    left: Math.max(0, cx - scroller.clientWidth / 2),
    behavior: smooth ? "smooth" : "auto",
  });
  const g = svg.querySelector(`g.polity[data-id="${id}"]`);
  if (g) {
    g.classList.remove("flash");
    void g.getBBox(); // 强制重绘
    clearTimeout(flashTimers.get(id));
    requestAnimationFrame(() => g.classList.add("flash"));
    flashTimers.set(id, setTimeout(() => {
      g.classList.remove("flash");
      flashTimers.delete(id);
    }, 2400));
  }
}

/* ---------- 搜索 (中英文名均可) ---------- */
const searchInput = $("#search");
const dl = $("#polity-names");
const searchChoices = new Map();
for (const p of DATA.polities) {
  const opt = document.createElement("option");
  opt.value = p.name;
  opt.label = p.en;
  dl.appendChild(opt);
  searchChoices.set(p.name, p.id);
}
function findMatches(q) {
  const lq = q.toLowerCase();
  const exact = DATA.polities.filter((p) => p.name === q || p.en.toLowerCase() === lq);
  return exact.length ? exact : DATA.polities.filter((p) =>
    p.name.includes(q) || p.en.toLowerCase().includes(lq));
}
function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  if (searchChoices.has(q)) {
    const id = searchChoices.get(q);
    jumpTo(id);
    openPanel(id);
    return;
  }
  const matches = findMatches(q);
  if (matches.length === 1) {
    jumpTo(matches[0].id);
    openPanel(matches[0].id);
  } else if (matches.length > 1) {
    openSearchResults(matches, q);
  }
}
searchInput.addEventListener("change", doSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

/* ---------- 缩放 / 切换布局: 保持视口中心的年代与地点不变 ---------- */
/* 像素 <-> 小数列号 (两种布局下列宽不同, 以列为单位保持横向中心) */
function pxToCol(x) {
  let c = 0;
  while (c < M.cols - 1 && colX[c + 1] <= x) c++;
  return c + Math.max(0, Math.min(1, (x - colX[c]) / (colX[c + 1] - colX[c])));
}
function colToPx(f) {
  const c = Math.min(M.cols - 1, Math.floor(f));
  return colX[c] + (f - c) * (colX[c + 1] - colX[c]);
}
function rerenderKeepingCenter(apply) {
  const oldRowH = ZOOMS[zoom].rowH;
  const centerRow = (scroller.scrollTop + (scroller.clientHeight - HEAD_H) / 2) / oldRowH;
  const centerCol = pxToCol(scroller.scrollLeft + scroller.clientWidth / 2 - AXIS_W());
  apply();
  render();
  scroller.scrollTop = centerRow * ZOOMS[zoom].rowH - (scroller.clientHeight - HEAD_H) / 2;
  scroller.scrollLeft = colToPx(centerCol) + AXIS_W() - scroller.clientWidth / 2;
}
function setZoom(z) {
  z = Math.max(0, Math.min(ZOOMS.length - 1, z));
  if (z === zoom) return;
  rerenderKeepingCenter(() => { zoom = z; });
}
$("#zoom-in").addEventListener("click", () => setZoom(zoom + 1));
$("#zoom-out").addEventListener("click", () => setZoom(zoom - 1));
scroller.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

/* ---------- 列布局切换 (?layout=area 可直接指定) ---------- */
const layoutBtn = $("#layout-toggle");
function applyLayout(l) {
  layout = l === "area" ? "area" : "equal";
  layoutBtn.setAttribute("aria-pressed", layout === "area");
  try { localStorage.setItem("world-layout", layout); } catch {}
}
layoutBtn.addEventListener("click", () =>
  rerenderKeepingCenter(() => applyLayout(layout === "area" ? "equal" : "area")));
{
  let saved = new URLSearchParams(location.search).get("layout");
  try { saved ||= localStorage.getItem("world-layout"); } catch {}
  applyLayout(saved);
}

/* ---------- 深浅色 ---------- */
const themeBtn = $("#theme-toggle");
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("world-theme", t); } catch {}
}
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(cur === "dark" ? "light" : "dark");
});
{
  const qs = new URLSearchParams(location.search).get("theme");
  let saved = qs;
  try { saved ||= localStorage.getItem("world-theme"); } catch {}
  if (saved === "dark" || saved === "light") applyTheme(saved);
}

/* ---------- 滚动联动 ---------- */
let raf = 0;
scroller.addEventListener("scroll", () => {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    updateLabels();
    updateYearPill();
    updateNavActive();
  });
});

/* ---------- 深链接: #y=年份 / #q=政权名 / #p=条目ID ---------- */
function applyHash(e) {
  const smooth = !!e; // 首次加载直接定位, 之后 hash 变化才平滑滚动
  const m = location.hash.match(/^#(y|q|p)=(.+)$/);
  if (!m) return false;
  if (m[1] === "y") {
    const y = parseInt(m[2], 10);
    if (!isNaN(y)) { scrollToYear(y, smooth); return true; }
  } else if (m[1] === "p") {
    const id = parseInt(m[2], 10);
    if (DATA.polities[id]?.id === id) {
      jumpTo(id, smooth);
      openPanel(id);
      return true;
    }
  } else {
    let q;
    try {
      q = decodeURIComponent(m[2]);
    } catch {
      return false;
    }
    const matches = findMatches(q);
    if (matches.length === 1) {
      jumpTo(matches[0].id, smooth);
      openPanel(matches[0].id);
      return true;
    }
    if (matches.length > 1) {
      openSearchResults(matches, q);
      return true;
    }
  }
  return false;
}
window.addEventListener("hashchange", applyHash);

/* ---------- 启动 ---------- */
render();
if (!applyHash()) scrollToYear(M.yearStart, false);
window.addEventListener("resize", () => { render(); });
