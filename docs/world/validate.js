#!/usr/bin/env node
/* 世界历史跨度图 —— 数据校验
 * 用法: node docs/world/validate.js [data.js 路径]   (默认校验同目录的 data.js)
 * 有问题时逐条列出并以退出码 1 结束。
 *
 * 检查项（展开逻辑与 js/app.js 一致: 年份四舍五入到十年格, 每段至少一行）:
 *   1. 位置字符串: 区域名存在、列号不越界、每个条目有 w 或 s
 *   2. 格子重叠: 同一格不能被两个政权占据（渲染时后者会覆盖前者）
 *   3. 首尾偏差: 绘图起止与 ex 相差超过 30 年时必须有 note
 *   4. 中间空档: 多段绘图之间断开超过 30 年时必须有 note
 */
"use strict";
const fs = require("fs");
const path = require("path");

const TOLERANCE = 30; // 年

const file = process.argv[2] || path.join(__dirname, "data.js");
const win = {};
new Function("window", fs.readFileSync(file, "utf8"))(win);
const D = win.WORLD_DATA, M = D.meta;
const GRID_END = M.yearStart + M.rows * M.yearStep;
const STRIDE = 128;

const REGION = {};
let cols = 0;
for (const rg of D.regions) {
  REGION[rg.key] = [cols, cols + rg.cols - 1];
  cols += rg.cols;
}
if (cols >= STRIDE) throw new Error(`列数 ${cols} 超过格子编号步长 ${STRIDE}`);

const problems = [];
const report = (kind, msg) => problems.push(`[${kind}] ${msg}`);

function endpoint(s, isEnd, name) {
  const [key, sub] = s.split(":");
  const r = REGION[key];
  if (!r) { report("位置", `${name}: 未知区域「${key}」`); return null; }
  if (sub === undefined) return isEnd ? r[1] : r[0];
  const [a, b] = sub.split("-").map(Number);
  const c = r[0] + (isEnd ? (b ?? a) : a);
  if (c > r[1]) { report("位置", `${name}: 列越界「${s}」`); return null; }
  return c;
}
const snapRow = (y) => Math.round((y - M.yearStart) / M.yearStep);
const rowYear = (r) => M.yearStart + r * M.yearStep;

const owner = new Map();     // 格子 -> 政权名
const overlaps = new Map();  // "甲 × 乙" -> 重叠年份
for (const p of D.polities) {
  if (!p.s && !p.w) { report("位置", `${p.n}: 缺少 w 或 s`); continue; }
  const segs = p.s || [[p.ex[0], p.ex[1] ?? GRID_END, p.w]];

  for (const [y0, y1, where] of segs) {
    const [a, b] = where.split("~");
    const c0 = endpoint(a, false, p.n), c1 = endpoint(b ?? a, true, p.n);
    if (c0 === null || c1 === null) continue;
    const r0 = Math.max(0, snapRow(y0));
    const r1 = Math.min(M.rows, Math.max(snapRow(y0) + 1, snapRow(y1)));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * STRIDE + c, o = owner.get(k);
        if (o && o !== p.n) {
          const pair = `${o} × ${p.n}`;
          if (!overlaps.has(pair)) overlaps.set(pair, []);
          overlaps.get(pair).push(rowYear(r));
        }
        owner.set(k, p.n);
      }
    }
  }

  if (p.note) continue;
  const s0 = Math.min(...segs.map((s) => s[0]));
  const s1 = Math.max(...segs.map((s) => s[1]));
  const e1 = p.ex[1] ?? GRID_END;
  if (Math.abs(s0 - p.ex[0]) > TOLERANCE || Math.abs(e1 - s1) > TOLERANCE) {
    report("偏差", `${p.n}: ex [${p.ex}] 而绘图为 [${s0}, ${s1}]，需写 note 说明`);
  }
  const iv = segs.map((s) => [s[0], s[1]]).sort((x, y) => x[0] - y[0]);
  let end = iv[0][1];
  for (const [a, b] of iv.slice(1)) {
    if (a - end > TOLERANCE) report("空档", `${p.n}: ${end}~${a} 未绘制，需写 note 说明`);
    end = Math.max(end, b);
  }
}
for (const [pair, ys] of overlaps) {
  report("重叠", `${pair}: ${Math.min(...ys)}~${Math.max(...ys)}年（${ys.length} 格）`);
}

console.log(`${D.polities.length} 个条目，${D.regions.length} 个区域，${cols} 列`);
if (problems.length) {
  for (const m of problems) console.log(m);
  console.log(`共 ${problems.length} 个问题`);
  process.exit(1);
}
console.log("校验通过");
