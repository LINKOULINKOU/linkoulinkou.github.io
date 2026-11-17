# AGENTS.md

工作区 `D:\mybolg`，站点在 `linkou-logbook/`（Astro + astro-pure，bun，GitHub Pages）。可复用工具 `script/`，临时脚本 `tmp/`，截图 `screenshot/`。

- 动手前读 `linkou-logbook/docs/SITE-INDEX.md`：只写代码里看不出来的东西，其余以源码为准。
- 不提交、不推送、不发布，除非用户明确授权。
- 用户说停或否定方向时立即停止；回退只动用户点名的部分。
- 同一文件同一时间只有一个写入者；子代理只做明确范围或只读复核。
- 改代码时顺手核对该文件里的注释：注释必须描述现状，不确定的删掉，不要留下“理想式”说明。
- 装饰与像素图集只改用户点名的位置，不得互相替换（分工见 `decor-frames.ts` 顶部）。
- 浏览器验证用 `script/verify.mjs` 的 `openPage` / `check`：写数值断言，不要为每次验证新写 CDP 样板，也不要靠反复看图判断。
- 验证按桌面：1280/1440/1920、键盘、无 JS、减少动态偏好；不做移动端与 200% 重排。
