/* 中国朝代跨度图 —— 渲染与交互
 * 数据: window.DYNASTY_DATA (由 tools/extract.py 生成)
 * 坐标系: 纵轴=时间(每行10年), 横轴=地理(42列/7大区)
 */
"use strict";

const DATA = window.DYNASTY_DATA;
const M = DATA.meta;
const SVGNS = "http://www.w3.org/2000/svg";

/* ---------- 缩放档位 ---------- */
const ZOOMS = [
  { rowH: 7,  colW: 17, fs: 11 },   // 概览
  { rowH: 12, colW: 24, fs: 15 },   // 默认
  { rowH: 20, colW: 32, fs: 18 },   // 细看
];
let zoom = window.innerWidth < 700 ? 0 : 1;

const AXIS_W = () => (window.innerWidth < 700 ? 40 : 52);
const HEAD_H = 38;

/* ---------- 主线朝代导航 ---------- */
const NAV = [
  ["夏", -2030], ["商", -1600], ["西周", -1046], ["春秋", -770], ["战国", -403],
  ["秦", -221], ["西汉", -202], ["东汉", 25], ["三国", 220], ["两晋", 266],
  ["南北朝", 420], ["隋", 581], ["唐", 618], ["五代", 907], ["北宋", 960],
  ["南宋", 1127], ["元", 1271], ["明", 1368], ["清", 1644], ["民国", 1912],
  ["共和国", 1949],
];
/* 时代分界虚线 */
const ERA_LINES = [
  [-770, "平王东迁"], [-221, "秦统一"], [220, "汉亡"], [589, "隋统一"],
  [907, "唐亡"], [1279, "宋亡"], [1368, "明立"], [1644, "清入关"],
  [1912, "民国"], [1949, "共和国"],
];

/* ---------- 工具 ---------- */
const $ = (s) => document.querySelector(s);
const NOW = new Date().getFullYear();
const GRID_END = M.yearStart + M.rows * M.yearStep; // 数据网格终点(原表画到2030)
/* 不预测未来: 网格与色块在当前年份截止, 仍存续的政权显示「今」 */
const END_ROW = Math.min(M.rows, (NOW - M.yearStart) / M.yearStep);
const fmtYear = (y) =>
  (y >= GRID_END ? "今" : y < 0 ? `前${-y}` : y === 0 ? "公元元年" : `${y}`);
const fmtYearFull = (y) =>
  (y >= GRID_END ? "今" : y < 0 ? `公元前${-y}年` : y === 0 ? "公元元年" : `公元${y}年`);
/* 精确年份 (p.ex=[起,止], 数字/字符串/null): 有则显示准确年,
   无则回落到「约 + 十年颗粒」; 绘图始终用十年颗粒 */
const exSide = (v, fb) => {
  if (typeof v === "number") return fmtYearFull(v);
  if (typeof v === "string") return `${v}年`;
  return fb >= GRID_END ? "今" : `约${fmtYearFull(fb)}`;
};
const exSideShort = (v, fb) => {
  if (typeof v === "number") return fmtYear(v);
  if (typeof v === "string") return v;
  return fb >= GRID_END ? "今" : `约${fmtYear(fb)}`;
};
const yearsText = (p) => {
  const ex = p.ex || [];
  return `${exSide(ex[0], p.y0)} — ${exSide(ex[1], p.y1)}`;
};
const yearsTextShort = (p) => {
  const ex = p.ex || [];
  return `${exSideShort(ex[0], p.y0)}\u2013${exSideShort(ex[1], p.y1)}`;
};
const gridYearsText = (p) =>
  `${exSide(null, p.y0)} — ${exSide(null, p.y1)}`;
const hasSpanMismatch = (p) => {
  const [s, e] = p.ex || [];
  const tol = M.yearStep;
  return (typeof s === "number" && Math.abs(s - p.y0) > tol) ||
    (typeof e === "number" && Math.abs(e - p.y1) > tol);
};
const durText = (p) => {
  const [s, e] = p.ex || [];
  const ongoing = p.y1 >= GRID_END;
  if (typeof s === "number" && ongoing) return `至今${NOW - s}年`;
  if (typeof s === "number" && typeof e === "number") {
    return `${e - s - (s < 0 && e > 0 ? 1 : 0)}年`;
  }
  return ongoing ? `至今约${NOW - p.y0}年` : `约${p.y1 - p.y0}年`;
};
const yearToRow = (y) => (y - M.yearStart) / M.yearStep;

function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (x) => Math.round(((n >> x) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const L = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return L > 140;
}

/* ---------- 政权几何: 由格子集合描出轮廓 ---------- */
function cellSet(runs) {
  const s = new Set();
  for (const [r, c0, c1] of runs) for (let c = c0; c <= c1; c++) s.add(r * 64 + c);
  return s;
}
/* 返回若干闭合环, 每环为 [x,y] 网格顶点序列 (顺时针, 屏幕坐标 y 向下) */
function traceOutline(cells) {
  const key = (x, y) => y * 64 + x;
  const edges = new Map(); // startVertex -> [{x2,y2,dir}]
  const addEdge = (x1, y1, x2, y2, dir) => {
    const k = key(x1, y1);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ x: x2, y: y2, dir });
  };
  for (const id of cells) {
    const r = Math.floor(id / 64), c = id % 64;
    if (!cells.has((r - 1) * 64 + c)) addEdge(c, r, c + 1, r, 0);       // 上边 →
    if (!cells.has(r * 64 + c + 1)) addEdge(c + 1, r, c + 1, r + 1, 1); // 右边 ↓
    if (!cells.has((r + 1) * 64 + c)) addEdge(c + 1, r + 1, c, r + 1, 2); // 下边 ←
    if (!cells.has(r * 64 + c - 1)) addEdge(c, r + 1, c, r, 3);         // 左边 ↑
  }
  const loops = [];
  for (const [startK, list] of edges) {
    while (list.length) {
      const first = list.pop();
      let x = startK % 64, y = Math.floor(startK / 64);
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
function loopsToPath(loops, colW, rowH, rad) {
  let d = "";
  for (const pts of loops) {
    const P = pts.map(([x, y]) => [x * colW, y * rowH]);
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

/* ---------- 预计算 ---------- */
for (const p of DATA.polities) {
  p.cells = cellSet(p.runs);
  p.loops = traceOutline(p.cells);
  p.dispName = p.name || "（未标注）";
  // 标签竖排文字: 去掉括号注和顿号
  let t = (p.name || "").replace(/（[^）]*）/g, "").replace(/、/g, "");
  p.labelText = t || p.name || "";
  // 每个标签的可跟随范围: 该标签列带上, 政权连续占据的行区间
  p.labelSpans = p.labels.map(([r0, c0, r1, c1]) => {
    const colHit = (r) => {
      for (let c = c0; c <= c1; c++) if (p.cells.has(r * 64 + c)) return true;
      return false;
    };
    let ys = r0, ye = r1;
    while (ys > 0 && colHit(ys - 1)) ys--;
    while (ye < M.rows - 1 && colHit(ye + 1)) ye++;
    return [ys, ye];
  });
}

/* ---------- 渲染 ---------- */
const scroller = $("#scroller");
const canvas = $("#canvas");
const chartWrap = $("#chart-wrap");
let svg = null;
let labelEls = [];  // 跟随滚动的标签及其原始位置/可移动范围
let selected = null;

let curColW = ZOOMS[1].colW; // 实际列宽 (宽屏下自适应铺满)
function render() {
  const { rowH, fs } = ZOOMS[zoom];
  const axw = AXIS_W();
  const colW = Math.max(ZOOMS[zoom].colW,
    Math.floor((scroller.clientWidth - 2 * axw) / M.cols));
  curColW = colW;
  const W = M.cols * colW, H = END_ROW * rowH;

  canvas.style.gridTemplateColumns = `${axw}px ${W}px ${axw}px`;
  canvas.style.gridTemplateRows = `${HEAD_H}px ${H}px`;

  /* 区域表头 */
  const head = $("#colhead");
  head.innerHTML = "";
  DATA.regions.forEach((rg, i) => {
    const div = document.createElement("div");
    div.className = "region" + (i % 2 ? " alt" : "");
    div.textContent = rg.name;
    div.style.left = rg.c0 * colW + "px";
    div.style.width = (rg.c1 - rg.c0 + 1) * colW + "px";
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
      rect.setAttribute("x", rg.c0 * colW);
      rect.setAttribute("width", (rg.c1 - rg.c0 + 1) * colW);
      rect.setAttribute("y", 0);
      rect.setAttribute("height", H);
      rect.setAttribute("class", "region-shade");
      bg.appendChild(rect);
    }
    if (i > 0) {
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", rg.c0 * colW); ln.setAttribute("x2", rg.c0 * colW);
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
  const rad = Math.min(4, rowH / 2.5);
  for (const p of DATA.polities) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "polity" + (p.color ? "" : " nofill") +
      (selected === p.id ? " selected" : ""));
    g.dataset.id = p.id;
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", loopsToPath(p.loops, colW, rowH, rad));
    if (p.color) {
      path.setAttribute("fill", p.color);
      path.setAttribute("stroke", darken(p.color, 0.62));
    }
    g.appendChild(path);

    /* 标签: 列范围与行跨度均重叠的多个标签只保留最大者 */
    const order = p.labels
      .map((rect, li) => ({ rect, li, area: (rect[2] - rect[0] + 1) * (rect[3] - rect[1] + 1) }))
      .sort((a, b) => b.area - a.area);
    const kept = [];
    for (const item of order) {
      const [r0, c0, r1, c1] = item.rect;
      const [ys, ye] = p.labelSpans[item.li];
      const clash = kept.some((k) =>
        c0 <= k.c1 && k.c0 <= c1 && ys <= k.ye && k.ys <= ye);
      if (!clash) kept.push({ li: item.li, c0, c1, ys, ye });
    }
    const keepSet = new Set(kept.map((k) => k.li));
    p.labels.forEach(([r0, c0, r1, c1], li) => {
      const text = p.labelText;
      if (!text || !keepSet.has(li)) return;
      const wPx = (c1 - c0 + 1) * colW, hPx = (r1 - r0 + 1) * rowH;
      const horiz = wPx > hPx * 1.4 && text.length > 1;
      let size;
      if (horiz) size = Math.min(fs, hPx * 0.8, (wPx - 6) / text.length);
      else size = Math.min(fs, colW * 0.72, Math.max(hPx * 0.9 / text.length, 0));
      // 长政权名字号不受高度限制 (可跟随滚动), 短的必须塞得下
      const [ys, ye] = p.labelSpans[li];
      const spanH = (ye - ys + 1) * rowH;
      if (!horiz && size * text.length > spanH) size = spanH * 0.92 / text.length;
      if (size < 7.5) return; // 太小不渲染, 靠悬停提示
      const tx = document.createElementNS(SVGNS, "text");
      tx.setAttribute("class", "lbl" + (p.color && !isLight(p.color) ? " on-dark" : ""));
      tx.setAttribute("font-size", size.toFixed(1));
      const cx = ((c0 + c1 + 1) / 2) * colW;
      const cy = ((r0 + r1 + 1) / 2) * rowH;
      if (horiz) {
        tx.setAttribute("x", cx); tx.setAttribute("y", cy);
        tx.setAttribute("dominant-baseline", "central");
        tx.textContent = text;
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
      }
      g.appendChild(tx);
      labelEls.push({
        el: tx, cx, cy, c0, c1, cells: p.cells, rowH, colW, horiz,
        h: horiz ? size : size * text.length,
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

      // 标签随年代移动时，原标签矩形所在的列不一定仍被该政权占据
      // （形状忽宽忽窄的政权尤其明显）。取目标行中矩形范围内实际
      // 有色块的列中心，避免文字漂到轮廓外——横排竖排标签都要处理。
      const row = Math.max(0, Math.min(M.rows - 1, Math.floor(target / L.rowH)));
      let hit0 = null, hit1 = null;
      for (let c = L.c0; c <= L.c1; c++) {
        if (!L.cells.has(row * 64 + c)) continue;
        if (hit0 === null) hit0 = c;
        hit1 = c;
      }
      if (hit0 !== null) targetX = ((hit0 + hit1 + 1) / 2) * L.colW;
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
  const yTop = M.yearStart + (scroller.scrollTop / rowH) * 10 +
    ((scroller.clientHeight - HEAD_H) / rowH) * 10 * 0.25;
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
    `<span>年代：${yearsText(p)} · ${durText(p)}</span>` +
    (hasSpanMismatch(p) ? `<span>原表色块：${gridYearsText(p)}</span>` : "") +
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

  const others = DATA.polities
    .filter((q) => q.id !== id && q.y0 < p.y1 && q.y1 > p.y0 && q.name)
    .map((q) => ({ q, ov: Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) }))
    .sort((a, b) => b.ov - a.ov)
    .slice(0, 16);

  let html = `<h2><span class="swatch" style="background:${p.color || "transparent"}"></span>${p.dispName}</h2>`;
  if (p.raw) html += `<p class="raw">原表作「${p.raw}」</p>`;
  html += `<p class="years">年代：${yearsText(p)}<em>${durText(p)}</em></p>`;
  if (hasSpanMismatch(p)) {
    html += `<p class="source-years">原表色块覆盖：${gridYearsText(p)}</p>`;
  }
  html += `<p class="chips">${p.regions.map((r) => `<span>${r}</span>`).join("")}</p>`;
  if (p.intro) html += `<p class="intro">${p.intro}</p>`;
  if (p.note) html += `<p class="note">📌 原表批注：${p.note}</p>`;
  if (others.length) {
    html += `<h3>同期政权</h3><ul class="concurrent">` +
      others.map(({ q }) =>
        `<li data-id="${q.id}"><i style="background:${q.color || "transparent"}"></i>${q.dispName}<small>${yearsTextShort(q)}</small></li>`
      ).join("") + "</ul>";
  }
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
    `<p class="raw">找到 ${matches.length} 个同名或近似条目，请按年代选择。</p>` +
    `<ul class="concurrent search-results">` +
    matches.map((p) =>
      `<li data-id="${p.id}"><i style="background:${p.color || "transparent"}"></i>` +
      `${p.dispName}<small>${yearsTextShort(p)}</small></li>`
    ).join("") + "</ul>";
  panel.hidden = false;
  bindPanelLinks();
}

/* ---------- 跳转 + 闪烁 ---------- */
const flashTimers = new Map();
function jumpTo(id) {
  const p = DATA.polities[id];
  const { rowH } = ZOOMS[zoom];
  const colW = curColW;
  const rect = p.labels[0] || [yearToRow(p.y0), 0, yearToRow(p.y1) - 1, M.cols - 1];
  const cy = ((rect[0] + rect[2] + 1) / 2) * rowH + HEAD_H;
  const cx = ((rect[1] + rect[3] + 1) / 2) * colW + AXIS_W();
  scroller.scrollTo({
    top: Math.max(0, cy - scroller.clientHeight / 2),
    left: Math.max(0, cx - scroller.clientWidth / 2),
    behavior: "smooth",
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

/* ---------- 搜索 ---------- */
const searchInput = $("#search");
const dl = $("#polity-names");
const searchChoices = new Map();
{
  const groups = new Map();
  for (const p of DATA.polities) {
    if (!p.name) continue;
    if (!groups.has(p.name)) groups.set(p.name, []);
    groups.get(p.name).push(p);
  }
  for (const matches of groups.values()) {
    for (const p of matches) {
      const value = matches.length > 1
        ? `${p.name} · ${yearsTextShort(p)} · #${p.id}`
        : p.name;
      const opt = document.createElement("option");
      opt.value = value;
      opt.label = p.regions.join(" / ");
      dl.appendChild(opt);
      searchChoices.set(value, p.id);
    }
  }
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
  const exact = DATA.polities.filter((p) => p.name === q);
  const matches = exact.length ? exact : DATA.polities.filter((p) => p.name.includes(q));
  if (matches.length === 1) {
    jumpTo(matches[0].id);
    openPanel(matches[0].id);
  } else if (matches.length > 1) {
    openSearchResults(matches, q);
  }
}
searchInput.addEventListener("change", doSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

/* ---------- 缩放 ---------- */
function setZoom(z) {
  z = Math.max(0, Math.min(ZOOMS.length - 1, z));
  if (z === zoom) return;
  // 保持视口中心年代不变
  const old = ZOOMS[zoom];
  const oldColW = curColW;
  const centerRow = (scroller.scrollTop - HEAD_H + (scroller.clientHeight - HEAD_H) / 2) / old.rowH;
  const centerColFrac = (scroller.scrollLeft + scroller.clientWidth / 2 - AXIS_W()) / (M.cols * oldColW);
  zoom = z;
  render();
  const nw = ZOOMS[zoom];
  scroller.scrollTop = centerRow * nw.rowH + HEAD_H - (scroller.clientHeight - HEAD_H) / 2;
  scroller.scrollLeft = centerColFrac * M.cols * curColW + AXIS_W() - scroller.clientWidth / 2;
}
$("#zoom-in").addEventListener("click", () => setZoom(zoom + 1));
$("#zoom-out").addEventListener("click", () => setZoom(zoom - 1));
scroller.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoom + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

/* ---------- 深浅色 ---------- */
const themeBtn = $("#theme-toggle");
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("dynasty-theme", t);
}
themeBtn.addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(cur === "dark" ? "light" : "dark");
});
{
  const qs = new URLSearchParams(location.search).get("theme");
  const saved = qs || localStorage.getItem("dynasty-theme");
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
function applyHash() {
  const m = location.hash.match(/^#(y|q|p)=(.+)$/);
  if (!m) return false;
  if (m[1] === "y") {
    const y = parseInt(m[2], 10);
    if (!isNaN(y)) { scrollToYear(y, false); return true; }
  } else if (m[1] === "p") {
    const id = parseInt(m[2], 10);
    if (DATA.polities[id]?.id === id) {
      jumpTo(id);
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
    const exact = DATA.polities.filter((p) => p.name === q);
    const matches = exact.length ? exact : DATA.polities.filter((p) => p.name.includes(q));
    if (matches.length === 1) {
      jumpTo(matches[0].id);
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
if (!applyHash()) scrollToYear(-2030, false);
window.addEventListener("resize", () => { render(); });
