# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

把《朝代跨度表.xlsx》（一张"时间×地理"的中国政权跨度 Excel 图）转成的纯静态交互网页。
线上地址：https://bones7456.github.io/china-dynasty-timeline/ （GitHub Pages，`main` 分支 `/docs` 目录，push 即部署）。

**重要**：原始 Excel 已定稿且被 .gitignore 忽略（fresh clone 里没有这个文件），`tools/extract.py` 是一次性解析工具。数据的权威来源是已入库的 `docs/data.json` + `docs/data.js`。除非本地存在 Excel 文件，否则不要尝试重跑 extract.py；日常数据修正应直接同步修改 `docs/data.json` 和 `docs/data.js` 两个文件（data.js 只是 `window.DYNASTY_DATA=<同一份JSON>;` 包装，供 file:// 场景使用，两者必须保持一致）。

## 常用命令

```bash
# 本地预览（或直接双击 docs/index.html，数据内嵌无需服务器）
cd docs && python3 -m http.server 8000

# 重新生成数据（仅当本地有 朝代跨度表.xlsx 时；产物: docs/data.json、docs/data.js、tools/report.md）
uv run --with openpyxl tools/extract.py

# 无头 Chrome 截图验证（本项目的标准验证手段，无测试框架）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1440,900 --screenshot=/tmp/shot.png \
  "file:///$PWD/docs/index.html#y=618"
```

- Python 一律用 `uv run`（需要包时 `uv run --with <pkg>`），不要 pip install。
- 页面支持深链接，便于截图验证：`#y=618`（定位年份）、`#q=唐`（定位政权并开详情）、`?theme=dark`。

## 坐标系与数据模型（全项目的公共约定）

- 纵轴 = 时间：每行 10 年，行 0 = 公元前 2030 年（`meta.yearStart=-2030, yearStep=10`）。
- 横轴 = 地理：42 列分属 7 大区（东南亚/青藏高原/西域/中原/东北/外蒙古/中亚），见 `data.json` 的 `regions`。
- 每个政权（polity）是同色格子组成的不规则区域：
  - `runs`: 行程列表 `[row, col0, col1]`（0-based）
  - `labels`: 标签矩形 `[r0, c0, r1, c1]`（来自原表带名字的合并单元格）
  - `y0/y1`: 十年颗粒的起止年（绘图用）
  - `ex`: 精确起止年 `[起, 止]`（展示用）——int=公历年（负=公元前）、str=原样显示（如 "约前1600"）、null=该侧回落为「约+十年颗粒」（止年为 null 且块到网格尾 → 显示「今」）

## 数据管线（tools/extract.py，一次性）

解析算法的核心概念，改数据规则时需要理解：

- **种子（seed）**：原表带名字的合并单元格/散落格；同色相邻格子归并为连通块。
- **多种子连通块的切分**：非对称最近距离——政权向后（时间晚）延续便宜（×3）、向前追溯昂贵（×10），即"政权存续至继任者出现"。
- 顶部的规则表：`RENAMES`（错别字/归并，如 李渊→唐、刘秀→东汉）、`RENAME_AT`（按坐标定点改名，处理同名不同政权）、`EXTRA_SEEDS`（虚拟切分锚点，钉住著名分界如 1127 靖康）、`COLOR_ALIAS`（原表近似重色归一）。
- 同名同色的分离块合并为一个政权的多个时段（如秦、西域诸国、西辽）。
- 所有修正会写入 `tools/report.md` 审核报告。

## 人工维护的内容（键规则相同）

- `tools/intros.py`：政权简介（273 条）
- `tools/years.py`：精确起止年（236 条，查证自维基百科）

两者的键都是政权名，**重名政权用 `名称@块起始年` 消歧**（起始年是十年颗粒的 y0，查 `tools/report.md` 的全部政权表），如 `齐@-760`（姜齐）vs `齐@-200`（楚汉齐国）。改动后需重跑 extract.py 才能进入 data.json；Excel 缺失时改用手改 data.json/data.js。

## 前端（docs/，无依赖原生 JS）

`docs/js/app.js` 单文件包含全部逻辑，关键部分：

- **轮廓描迹**：`traceOutline` 把格子集合描成闭合环（顺时针、右转优先处理对角相接），`loopsToPath` 生成圆角 SVG path。
- **展示三原则**：① 绘图永远用十年颗粒（y0/y1）；② 文字内容优先精确年（`ex`，见 `yearsText/durText`）；③ 不预测未来——网格在 `NOW`（当前年份）截止，仍存续政权显示「今」（原表画到 2030）。
- **标签跟随**：政权名（竖排）随滚动黏在其色块的可见区间内（`updateLabels`）；同一政权列范围与行跨度都重叠的多个标签只渲染最大者。
- 布局：单一滚动容器 + CSS grid，区域表头 sticky top、左右年份轴 sticky left/right；宽屏下列宽自适应铺满（`curColW`）。
- 视觉基调是古卷纸质感，深浅色通过 CSS 变量（`:root[data-theme]` + prefers-color-scheme 回落）；政权颜色继承自原 Excel，是实体身份的一部分，不要重新配色。

## 修改后的验证

改完前端或数据后，用无头 Chrome 对典型时段截图目视检查（战国 `#y=-320`、南北朝隋唐 `#y=400`、五代两宋 `#y=920`、明清 `#y=1400`、详情面板 `#q=唐`、移动端 `--window-size=390,844`、深色 `?theme=dark`），并 grep stderr 中的 `:ERROR:CONSOLE` 确认无 JS 报错。
