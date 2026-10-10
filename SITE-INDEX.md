# SITE-INDEX.md — 站点骨架与修改索引

> 本文件是给接手本仓库的 AI agent（也给人）的站点索引；仓库根的 `AGENTS.md` 指向本文件。
> 动手改任何东西之前先读这里，按「改什么 → 去哪改」直接定位。
>
> - 站点：<https://linkoulinkou.github.io/>（个人博客，静态站）
> - GitHub 仓库：`LINKOULINKOU/linkoulinkou.github.io`（本地目录名 `linkou-logbook`）
> - 技术栈：Astro 6 + UnoCSS + 主题 `astro-pure@1.4.9`（Astro Theme Pure，MIT）
> - 主题官方文档（外部参考）：<https://astro-pure.js.org/docs>
> - 注意：站点展示语言是中文，但 `theme.locale` 配的 `en-US`（日期显示格式用）

## 1. 运行与部署

包管理器固定用 **bun**（仓库有 `bun.lock`）。不要换回 pnpm——历史上 pnpm 的严格依赖隔离导致 `@astrojs/markdown-remark` 解析失败、构建挂掉。

| 命令（仓库根执行） | 作用                                                         |
| ------------------ | ------------------------------------------------------------ |
| `bun install`      | 安装依赖                                                     |
| `bun run dev`      | 本地开发服务器（http://localhost:4321）                      |
| `bun run build`    | 构建：内部为 `astro-pure check && astro check && astro build`，产物在 `dist/` |
| `bun run preview`  | 本地预览构建产物                                             |
| `bun run check`    | 类型检查；`bun run lint` / `bun run format` 为 ESLint / Prettier |

**部署链路**：push 到 `main` → `.github/workflows/deploy.yml`（GitHub Actions：`bun install --frozen-lockfile` → `bun run build` → upload-pages-artifact → deploy-pages）→ GitHub Pages。
**改完的验证流程**：本地 `bun run build` 通过 → push → 确认 Actions 成功 → 打开线上页面核对。

网络提示（仅本机）：仓库 `.git/config` 已配置代理 `http.proxy` / `https.proxy` = `http://127.0.0.1:7897`；推送超时时先确认本机代理开着。

## 2. 快速定位表（改 X → 看 Y）

| 想改的东西                              | 文件 / 位置                                                  |
| --------------------------------------- | ------------------------------------------------------------ |
| 站点标题、作者、描述                    | `src/site.config.ts` → `theme.title / author / description`  |
| 顶栏导航菜单                            | `src/site.config.ts` → `theme.header.menu`                   |
| 页脚（版权行、附加链接、社交图标）      | `src/site.config.ts` → `theme.footer`（`social` 现为 GitHub 主页 + RSS） |
| 页头/页脚的结构本身（非文案）           | 主题包 `node_modules/astro-pure/components/basic/`（Header.astro / Footer.astro）；改法见 §6 |
| Logo / 头像                             | `src/site.config.ts` → `theme.logo.src` → 文件 `src/assets/avatar.png` |
| favicon、社交分享图                     | `public/favicon/*`、`public/images/social-card.png`（由 `theme.favicon`、`theme.socialCard` 引用） |
| **配色**（亮/暗两套主题色）             | `src/assets/styles/app.css` 顶部 `:root {...}` 与 `.dark {...}` 的 CSS 变量（`--primary` 等）——改变量即全站生效 |
| 全局样式、动画、代码块外观              | `src/assets/styles/global.css`                               |
| 正文排版（引用块/行内代码等）           | `uno.config.ts`（typographyConfig）+ `src/site.config.ts` → `integ.typography` |
| 首页                                    | `src/pages/index.astro`（区块组件 `src/components/home/`）   |
| About 页                                | `src/pages/about/index.astro`（辅助组件 `src/components/about/`） |
| Projects 页                             | `src/pages/projects/index.astro`（组件 `src/components/projects/`） |
| 友链页                                  | `src/pages/links/index.astro` + 数据 `public/links.json`（组件 `src/components/links/FriendList.astro`） |
| 博客文章                                | `src/content/blog/<slug>/index.md`（格式见 §4）              |
| 博客列表 / 文章页 / 分页                | `src/pages/blog/[...page].astro`、`src/pages/blog/[...id].astro` |
| 博客列表每页篇数、分享按钮              | `src/site.config.ts` → `theme.content.blogPageSize / share`  |
| 归档页                                  | `src/pages/archives/index.astro`                             |
| 标签页                                  | `src/pages/tags/index.astro`、`src/pages/tags/[tag]/[...page].astro` |
| 搜索页（pagefind 静态搜索）             | `src/pages/search/index.astro`                               |
| 评论（Waline 开关/服务端/文案）         | `src/site.config.ts` → `integ.waline`；组件 `src/components/waline/` |
| 条款页（隐私政策等）                    | `src/pages/terms/*.md`（入口列表在 `src/site.config.ts` → `terms`） |
| 字体                                    | `astro.config.ts` → `fonts`（当前 Satoshi，来自 fontshare）  |
| Markdown 扩展 / 代码高亮                | `astro.config.ts` → `markdown`；自定义插件在 `src/plugins/`  |
| `<head>` 元信息 / SEO                   | `src/components/BaseHead.astro`                              |
| RSS / robots.txt                        | `src/pages/rss.xml.ts`、`src/pages/robots.txt.ts`            |
| 404 页                                  | `src/pages/404.astro`                                        |

## 3. 目录结构（关键文件注记）

```
linkou-logbook/
├─ astro.config.ts        # Astro 与集成配置（site URL、markdown、字体、astro-pure 集成）
├─ uno.config.ts          # UnoCSS：设计 token / 排版；颜色别名映射到 app.css 的 CSS 变量
├─ package.json           # bun scripts；name 仍是主题默认值 astro-theme-pure（见 §7）
├─ .github/workflows/deploy.yml  # GitHub Pages 自动部署
├─ public/                # 原样拷贝到 dist 的静态文件
│  ├─ favicon/            # 站点图标
│  ├─ images/social-card.png     # 社交分享图
│  ├─ links.json          # 友链数据（友链页读取；当前还是演示数据）
│  └─ icons/、scripts/    # 主题用的 SVG 与 RSS 样式表
└─ src/
   ├─ site.config.ts      # ★ 站点级配置总入口（见 §2 表）
   ├─ content.config.ts   # blog 内容集合 schema（frontmatter 字段定义）
   ├─ content/blog/       # ★ 文章目录（每篇一个文件夹）
   ├─ pages/              # 路由：一个文件=一个页面（页面↔URL 见下表）
   ├─ layouts/            # 布局链（见 §5）
   ├─ components/         # 本项目自有组件（home/about/projects/links/waline + BaseHead）
   ├─ assets/             # 会被构建处理的资源（头像、二维码、图标、样式）
   │  └─ styles/          # app.css（配色变量）、global.css（全局样式）
   ├─ plugins/            # 自定义 rehype / Shiki 插件
   └─ type.d.ts           # 虚拟模块类型声明
（node_modules/astro-pure/ = 主题包源码：不进仓库、重装会重置，只作参考；见 §6）
```

页面 ↔ URL 对应：

| 文件                                      | URL                          |
| ----------------------------------------- | ---------------------------- |
| `src/pages/index.astro`                   | `/`                          |
| `src/pages/blog/[...page].astro`          | `/blog`、`/blog/2` …（分页） |
| `src/pages/blog/[...id].astro`            | `/blog/<slug>`（每篇文章）   |
| `src/pages/about/index.astro`             | `/about`                     |
| `src/pages/projects/index.astro`          | `/projects`                  |
| `src/pages/links/index.astro`             | `/links`                     |
| `src/pages/archives/index.astro`          | `/archives`                  |
| `src/pages/tags/…`                        | `/tags`、`/tags/<标签>`      |
| `src/pages/search/index.astro`            | `/search`                    |
| `src/pages/terms/*`                       | `/terms` 及 4 篇子页         |
| `src/pages/404.astro`                     | 404                          |
| `src/pages/rss.xml.ts` / `robots.txt.ts`  | `/rss.xml` / `/robots.txt`   |

## 4. 写文章（frontmatter 规范）

位置：`src/content/blog/<slug>/index.md`（一篇一个目录，方便图片放同目录、相对引用）。
字段由 `src/content.config.ts` 校验：

| 字段          | 必填 | 说明                                             |
| ------------- | ---- | ------------------------------------------------ |
| `title`       | ✅   | ≤60 字符                                         |
| `description` | ✅   | ≤160 字符                                        |
| `publishDate` | ✅   | 如 `2026-10-10 00:00:00`                         |
| `updatedDate` |      | 可选                                             |
| `tags`        |      | 字符串数组；自动去重转小写；生成 `/tags/<标签>` 页 |
| `heroImage`   |      | `{ src, alt?, ... }` 文章头图                    |
| `language`    |      | 如 `'中文'`                                      |
| `draft`       |      | `true` 为草稿                                    |
| `pin`         |      | 置顶                                             |
| `comment`     |      | 默认 `true`；`false` 关闭该文评论                |

示例（现存唯一文章 `src/content/blog/hello/index.md`）：

```md
---
title: Hello, World
publishDate: 2026-10-10 00:00:00
description: 第一篇占位文章，之后替换成正文。
tags:
  - 随笔
language: '中文'
---
```

## 5. 布局体系（页面渲染链）

1. `src/layouts/BaseLayout.astro` — 全站骨架：`<html>/<head>/<body>`、`Header`、`Footer`（来自主题包 `astro-pure/components/basic`）、亮暗主题切换（ThemeProvider）。
2. `src/layouts/ContentLayout.astro` — BaseLayout + 内容容器 + 返回顶部。
3. `src/layouts/CommonPage.astro` — ContentLayout + 目录（TOC）+ 评论 → `about`、`links`、`projects` 使用。
4. `src/layouts/BlogPost.astro` — ContentLayout + 文章件（Hero、版权声明、文章底部、图片缩放）→ `blog/[...id]` 使用。
5. `src/layouts/IndividualPage.astro` — terms 的 markdown 通过 frontmatter `layout:` 指定。

其余页面（首页、归档、标签、搜索、分页列表、404）直接用 `BaseLayout`。
读取配置的两种 import：项目内 `@/site-config`（即 `src/site.config.ts`）；主题注入的 `virtual:config`（由 astro-pure 集成提供，等价物）。

## 6. 主题包 astro-pure 与定制边界

- 组件与工具在 `node_modules/astro-pure/`：`components/basic`（Header/Footer/ThemeProvider）、`components/pages`（PostPreview/TOC/Hero/PFSearch/Paginator…）、`components/user`（Button/Card/Icon/Label/Timeline…）、`components/advanced`（Quote/MediumZoom）、`server`（文章集合工具）、`utils`。
- 集成**没有**「本地文件自动覆盖主题组件」的机制（当前版本实测）。要改主题内部组件的实现：把对应组件源码拷贝到 `src/` 下改造，再替换引用处的 import；不要直接改 `node_modules`（重装即丢）。
- 展示层能用配置解决的（导航、页脚、社交、开关）优先改 `src/site.config.ts`，不用碰主题包。
- 上游仓库（查最新实现）：<https://github.com/cworld1/astro-theme-pure>

## 7. 已知定制与注意事项

- 部署在**域名根路径**（用户站）：`astro.config.ts` 中 `site: 'https://linkoulinkou.github.io'`、无 `base`。主题里存在大量硬编码的根路径链接（此前排查到约 36 处，如 `/about`）——**不要**改为子路径部署，否则大量链接会断。
- 主题自带文档区已整体删除（原 `src/content/docs/`、`/docs` 路由、导航 Docs 入口、docs 内容集合）。
- 页脚 "theme powered" 链接已关闭（`theme.footer.credits: false`）；控制台主题横幅已移除。
- **页面正文还留有一批主题演示内容**（首页占位按钮/链接、About 页示例、Projects 示例条目、`public/links.json` 演示友链、`site.config.ts` 的 `logbook` 演示留言）——属"待大改"范围，改版时直接替换。
- Waline 评论服务端目前仍是主题演示服务器（`integ.waline.server` 指向第三方）；认真启用评论时需换自建/自有服务端。
- `package.json` 的 `name` 仍是 `astro-theme-pure`：无功能影响；若要改需同步 `bun.lock`，非必要不动。
- 站内搜索用 pagefind，构建时生成（`dist/pagefind/`）；需保持 `theme.prerender: true`。
