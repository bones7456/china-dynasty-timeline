# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

把《朝代跨度表.xlsx》（一张"时间×地理"的中国政权跨度 Excel 图）转成的纯静态交互网页。
线上地址：https://bones7456.github.io/china-dynasty-timeline/ （GitHub Pages，`main` 分支 `/docs` 目录，push 即部署）。

## 维护范围（最高优先级）

**后续维护不得读取、修改、运行或依赖任何 Python 代码及 Excel 文件。** 原始 Excel 和 `tools/` 下的 Python 数据管线均视为已停用的历史产物，不得检查、修复或重新执行，也不得用它们重新生成数据。

所有功能和数据修改只在 `docs/` 下完成。数据的权威来源是已入库的 `docs/data.json` 与 `docs/data.js`；修改数据时必须直接同步修改这两个文件。`data.js` 是 `window.DYNASTY_DATA=<同一份JSON>;` 包装，供 `file://` 场景使用，两者必须保持一致。

## 常用命令

```bash
# 本地预览：直接打开 docs/index.html，数据内嵌无需服务器
open docs/index.html

# 无头 Chrome 截图验证（本项目的标准验证手段，无测试框架）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1440,900 --screenshot=/tmp/shot.png \
  "file:///$PWD/docs/index.html#y=618"
```

- 页面支持深链接，便于截图验证：`#y=618`（定位年份）、`#q=唐`（按名称定位；同名时列出选项）、`#p=158`（按条目 ID）、`?theme=dark`。

## 坐标系与数据模型（全项目的公共约定）

- 纵轴 = 时间：每行 10 年，行 0 = 公元前 2030 年（`meta.yearStart=-2030, yearStep=10`）。
- 横轴 = 地理：42 列分属 7 大区（东南亚/青藏高原/西域/中原/东北/外蒙古/中亚），见 `data.json` 的 `regions`。
- 每个政权（polity）是同色格子组成的不规则区域：
  - `runs`: 行程列表 `[row, col0, col1]`（0-based）
  - `labels`: 标签矩形 `[r0, c0, r1, c1]`（来自原表带名字的合并单元格）
  - `y0/y1`: 十年颗粒的起止年（绘图用）
  - `ex`: 精确起止年 `[起, 止]`（展示用）——int=公历年（负=公元前）、str=原样显示（如 "约前1600"）、null=该侧回落为「约+十年颗粒」（止年为 null 且块到网格尾 → 显示「今」）

## 前端（docs/，无依赖原生 JS）

`docs/js/app.js` 单文件包含全部逻辑，关键部分：

- **轮廓描迹**：`traceOutline` 把格子集合描成闭合环（顺时针、右转优先处理对角相接），`loopsToPath` 生成圆角 SVG path。
- **展示三原则**：① 绘图永远用十年颗粒（y0/y1）；② 文字内容优先精确年（`ex`，见 `yearsText/durText`）；③ 不预测未来——网格在 `NOW`（当前年份）截止，仍存续政权显示「今」（原表画到 2030）。
- 详情面板与 tooltip 只展示 `ex` 精确年代，不再对比或标注色块本身的十年颗粒起止（即不出现"原表"相关文案）。
- **标签跟随**：政权名（竖排）随滚动黏在其色块的可见区间内（`updateLabels`）；同一政权列范围与行跨度都重叠的多个标签只渲染最大者。
- 布局：单一滚动容器 + CSS grid，区域表头 sticky top、左右年份轴 sticky left/right；宽屏下列宽自适应铺满（`curColW`）。
- 视觉基调是古卷纸质感，深浅色通过 CSS 变量（`:root[data-theme]` + prefers-color-scheme 回落）；政权颜色继承自原 Excel，是实体身份的一部分，不要重新配色。

## 修改后的验证

改完前端或数据后，用无头 Chrome 对典型时段截图目视检查（战国 `#y=-320`、南北朝隋唐 `#y=400`、五代两宋 `#y=920`、明清 `#y=1400`、详情面板 `#q=唐`、移动端 `--window-size=390,844`、深色 `?theme=dark`），并 grep stderr 中的 `:ERROR:CONSOLE` 确认无 JS 报错。
