# SITE-INDEX.md — 站点索引

> 本文件在 `linkou-logbook/docs/`。路径默认相对 `linkou-logbook/`；标「工作区根」的指 `D:\mybolg\`。
> 代码是第一事实源。这里只留三类：**改了就静默出错的契约**、**踩过一次就浪费半小时的坑**、**从哪开始做事**。

## 事实

- 站点 <https://linkoulinkou.github.io/>，仓库 `LINKOULINKOU/linkoulinkou.github.io`
- Astro + UnoCSS + astro-pure；bun；GitHub Pages；`zh-CN`；部署在域名根路径（**不要加 `base`**）

## 从哪开始

- 站点命令在 `linkou-logbook/` 里执行；`script/` 下的工具（验证、token 检查、CSS 结构检查、图集生成）在**工作区根**执行
- 装依赖：`bun install`。CI 用 `--frozen-lockfile`，**改依赖必须同一次提交带上 lock**
- 构建：`bun run build`（产物 `dist/`）。改了样式要重新构建再验证，预览的是构建产物
- 本地看：`bun run preview`（默认 4321）。`dev` 也占 4321，跨会话先关掉旧进程
- 测试：`bun test scripts/tests`
- 浏览器验证：写个小脚本 `import { openPage, check } from '../script/verify.mjs'`（相对脚本自身位置；绝对路径要写 `file:///D:/…`，裸 `script/…` 会当成包名）。CDP、截图、断言、临时 profile 都封装好了，**不要复制样板**，优先写数值断言而不是反复看图
- 追踪发布/同步：`scripts/publish-tracking.mjs`、`scripts/sync-tracking.mjs`，用法见各自文件头部，不要凭记忆拼参数
- 其余命令以 `package.json` 的 `scripts` 为准

## 会静默出错的契约

- 这些名字被代码与外部链接依赖，**不要改**：`.prose`、`.ln-prose`、`data-pagefind-body`、`data-pagefind-ignore`、`.tracking-note`、`#hotnews`、`#topics`、`data-pixel`、`data-wm-pixel`、`data-wm-row`
- pagefind 在构建期生成，必须保持 `theme.prerender: true`；关掉后搜索会静默失效
- 组件里引用的每个 `--ln-*` 必须真的在 tokens 里定义：改完在**工作区根**跑 `python script/check-tokens.py`（它也会扫 `.ts`）。拼错不会报错，只会静默回落
- `src/content/tracking/` 是脚本生成物，不要手改；其中 `kind: release` 的稿子会生成页面但列表里不显示（只能直链），构建照样绿——加稿前先确认类别
- 月份锚点格式是 `m-<kind>-YYYY-MM`（由列表组件与切换器各拼一次），深链依赖它；`TrackingTabs` 靠这个前缀反推类别，两边不一致时深链会静默回到默认分类
- 不要改 `node_modules` 里的主题，要改就拷到 `src/` 再替换 import

## 会浪费半小时的坑

- Windows 上 dev watcher 会锁源码文件，工具原子写入会报 `EBUSY` / `ReplaceFileW`：多文件改动前先停 dev
- PowerShell 的 `-Path` / `-Include` 把 `[ ]` 当通配符，方括号路由（`[...page]`、`[tag]`）会被**静默跳过**，从而误判“没人引用”。查引用用 ripgrep 或 `-LiteralPath`
- 用正则批量删 CSS 规则后必须跑 `node script/check-css.mjs`：只删选择器会留下悬空 `}`、让 `@media` 提前闭合，桌面规则会泄漏到窄屏，而 build 与桌面截图都发现不了（已实测踩过）
- 代理有两态：git 配了本地代理；代理没开时直连可用 `git -c http.proxy= -c https.proxy= push`。用 headless Chrome 抓线上同理，代理状态不匹配时页面会**静默空白**
- 有构建期/运行时的外部请求，失败会静默降级（页面少一块、构建仍绿）；出现“线上少内容但本地正常”先查这里
- 本地与线上不自动一致：`gh run list -w deploy.yml -L3 --json headSha,conclusion` 必须 `success` 且 `headSha` 能对上要验的提交（默认表格不含 sha）；线上页面用 verify.mjs 打开（每次全新 profile，等于无缓存），不要用“我构建过了”推断

## 本文件不记录

- 数值（色值、字号、间距、尺寸、时长）、除上文契约名之外的类名、token 前缀与路径清单 → 读源码
- 内容 schema 字段 → `content.config.ts`
- 设计史、被否决的方案、待办与状态快照 → 不入文档

## 维护

- `AGENTS.md` 在工作区根（每轮注入），仓库里 `docs/AGENTS.md` 是它的镜像：改完在**工作区根**跑 `node script/sync-docs.mjs` 同步，`--check` 会在不一致时失败
- 只在「入口/契约/坑/内容规则」变化时改本文件；视觉参数与重构历史不进文档
