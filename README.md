# LINKOULINKOU Blog

个人博客，用 [Astro](https://astro.build) 构建，基于 [Astro Theme Pure](https://github.com/cworld1/astro-theme-pure)（MIT License）。

## 本地开发

```bash
bun install
bun run dev
```

## 写文章

在 `src/content/blog/` 下新建 Markdown 文件，提交并推送到 `main` 后自动部署。

## 部署

推送到 `main` 分支后由 GitHub Actions 自动构建并发布到 GitHub Pages。

- 线上地址：https://linkoulinkou.github.io/
- 工作流：`.github/workflows/deploy.yml`
