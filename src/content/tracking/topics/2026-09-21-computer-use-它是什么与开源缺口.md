---
title: 'Computer Use 本质：agent 的第三条操作通道'
date: 2026-09-21
kind: topic
---

<details class="tracking-note">
<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>

> 调研日期：2026-09-21；最近修订：2026-09-21 12:20（应读者要求二次重写：上一版仍把 harness 层的沙箱/审批混入 computer use 组成、且「三层」表述与通道概念冲突导致本质不清——本版以「通道」概念重立骨架，明确「哪些属于本体、哪些属于包裹」）
> 本次操作：历史稿重写（同一轮调研素材不变：openai/codex 与 zai-org/ZCode 仓库核查、trycua/cua、awlevin/typesafe-computer-use、HN 帖；未新增网络检索）
> 核心问题：① computer use 的本质是什么，与 bash 是什么关系？② 它由哪几件东西组成，沙箱/审批到底在不在里面？③ 厂商闭源闭的到底是什么、为什么？
> 核查范围：openai/codex 仓库（根目录 + codex-rs 全部 127 crate 清单）、zai-org/ZCode 仓库（根目录 + architecture-policy.yaml + 开源范围）、ferstar 逆向审计记录（闭源客户端数据目录构成）、trycua/cua README、awlevin/typesafe-computer-use README、HN（CUA-S1 89 分、awlevin 82 分、ZCode 开源 4 分）
> 调研方式：GitHub contents API、raw.githubusercontent、HN Algolia、curl
> 证据缺口：三家厂商的 computer-use 内部实现均未公开（本文的「读出/注入」描述为实现原理推断，已标注）；Claude/Cursor/Trae 的 computer use 形态未核

</details>

## 先回答问题

- **一句话本质：computer use = agent 操作计算机的第三条通道——图形界面通道**。「看屏幕（观察器）+ 决定动作（模型）+ 动手（执行器）」三件套，缺一不可，多一件（沙箱/审批/审计）都不属于它。它与 bash **不是包含关系，是并列关系**：两条都能操作计算机，但覆盖的软件不同（见条目 1）。
- **与 bash 的关系**：能干的活有交集（都能让计算机做事），但互有独占域——bash 的独占域是命令行/脚本能力；computer use 的独占域是**只有图形界面的软件**（无 API、无 CLI 的桌面程序，比如某老的财务软件、某厂商只给了按钮的配置界面）。agent 三条通道齐全，才能覆盖「所有软件」（A；见条目 1）。
- **沙箱/审批/审计在哪：在 harness 层，不在 computer use 本体**。它们是 harness 包在**所有**操作通道外面的统一安全层（bash 通道同样被沙箱包着）——上一版专题把审批闸/评分器列成 computer use 的组成组件，是概念混淆，已改正（见条目 2 的边界澄清）。
- **厂商闭源闭的是什么**：不是沙箱（沙箱本就该独立于厂商），而是「看 + 做」的**可靠实现**——视觉 grounding（看屏幕知道点哪）与跨应用稳定的执行器，这是当前公认最难的工程，且无开源先例。实证：openai/codex 的 127 个 crate 与 ZCode 的开源 monorepo 均不含 computer-use，而两者的**闭源**客户端分别以 App 组件与 ~130MB 捆绑运行时的形式实现它（A；见条目 3、4）。

## 一、本质：agent 操作计算机的三条通道

agent 能动手操作计算机的通道只有三条，computer use 是其中一条：

| 通道 | 原理 | 覆盖什么软件 | 依赖 | 失败模式 |
|---|---|---|---|---|
| **API 通道** | 程序化调用 | 只覆盖提供了 API 的软件 | 对方得先写好接口 | 接口不存在就没辙 |
| **bash/终端通道** | 文字进、文字出（shell 命令） | 覆盖有命令行能力的软件 | 你得会写命令；对方得有 CLI | 软件没有 CLI 就没辙 |
| **GUI 通道（= computer use）** | 看屏幕 + 模拟鼠标键盘 | **覆盖一切有图形界面的软件**——包括 1985 年写的、只有按钮的桌面程序 | 视觉/元素树理解 + 输入注入 | 最慢、最贵、判定最容易错 |

三条通道是**并列关系**：GUI 通道的存在不是为了替代 bash——是为了覆盖前两条永远覆盖不了的软件（大量桌面软件没有 API 也没有 CLI）。这就是它的本质：**面向图形界面的通用操作通道**。

一个容易混淆点：bash 也能「操作计算机」（删文件、装软件），所以「它与 bash 什么关系」的准确回答是——**能力有交集，覆盖域不同**。对一个既有 CLI 又有 GUI 的软件，bash 通道通常更快更可靠；GUI 通道的价值只在「没有 CLI 的软件」上兑现。

来源：通道分类为分析框架（综合 trycua/cua 文档的「code, APIs, and graphical interfaces within the same task」表述与各 harness 实现）｜判断

## 二、computer use 本体的三件套（就这三样）

### 1. 观察器：把屏幕变成模型能读的东西

两种读法：**截图**（像素方式——信息全但要把画面交给模型，慢且隐私敏感）或**元素树**（结构化方式——读 UI 框架暴露的元素列表，形如 `[1] 按钮 更改行程类型 [2] 下拉框 出发地·旧金山…`，快且无图像）。jev-ultrafast 用元素树实现了「苏黎世→伦敦机票搜索 7.1 秒」的演示。

### 2. 模型：把「意图」变成「动作」的 grounding 能力

看元素表或截图，输出「点击 [3]」或「在输入框填 London」。这里的能力叫 **grounding**（看屏幕知道点哪）——它是专门训练的模型能力（CUA-S1、各厂商的 computer-use 模型都在训这个），大语言模型默认并不擅长。小专精模型（Jev、CUA-S1）与大模型在此是替代关系：窄任务上小模型够用且快 100 倍。

### 3. 执行器：把动作变成真实输入事件

一个驱动操作系统的程序：把「点击」变成鼠标事件、把「输入」变成键盘事件、处理坐标映射与窗口管理。ZCode 的闭源客户端把它打包成 ~130MB 的捆绑运行时。

**边界澄清（修正上一版的混淆）**：沙箱、审批闸、评分器、审计日志**不是 computer use 的组成部分**——它们是 harness 包在**所有**操作通道（bash/API/GUI）外面的统一安全层。判断「某仓库开源时是否抛掉了 computer use」，只看这三件套（观察器/模型/执行器）在不在，不要把安全包裹算进去。

来源：通道三件套的综合描述见 [trycua/cua README](https://github.com/trycua/cua)（"Cua provides the computer and automation tools"）与各 harness 实现｜A/分析

## 三、厂商闭源闭的是什么：三件套的可靠实现

上一版说「开源的是脑、闭源的是手」，方向对但表述仍模糊。精确的说法：**闭源的是「三件套的可靠实现」**——

- **观察器的可靠性**：元素树在不同 UI 框架下的覆盖与稳定性、动态界面的实时刷新；
- **grounding 的准确率**：看屏幕知道点哪，跨应用、跨分辨率、跨状态地准确——这是专门训练的模型能力（CUA-S1 一类），不是接个 API 就有；
- **执行器的工程度**：坐标映射、焦点管理、弹窗与多窗口处理、失败恢复。

为什么这值得闭源：①这是当前**公认最难的工程**——「可靠地点对地方、跨任意应用泛化」没有开源方案达到商用稳定度；②**demo 价值极高**（看 agent 操作电脑是最直观的产品演示，每家的发布会都靠它）；③**无开源先例**——第一个开源的会定义标准，也等于放弃领先身位（对照：CLI 界 OpenAI 开源 codex、Qwen 开源 qwen-code，执行层无人跟进开源）。

实证锚点（本轮仓库核查）：openai/codex 的 codex-rs 127 个 crate 与 ZCode 的 TS monorepo 均不含 computer-use 执行层；而两者的**闭源**客户端分别实现了它（Codex App 的「操作内建浏览器」、ZCode 的 ~130MB 捆绑运行时）。「有开源先例」的反例不成立——CLI 开源与执行层开源是两回事。

来源：仓库逐目录核查（09-17/21）｜A

## 四、原语化竞赛：三件套正在被逐件开源/做小

「电脑操作」的三件套正在被分别做成独立产品——这是本专题的竞赛观察：

- **决策模型**：TypeSafe 的 computer-use 模型（官方产品线，第三方 awlevin 实测**每步约 1/50 美分**驱动 Mac，HN 82 分）；trycua 的 **CUA-S1**（「small, specialized System 1 models for computer use」——官方明说 System 1 只是工程类比：快、有界的决策如「该填哪个值」「哪个元素别动」，首个 profile 是表单打分而非逐 token 生成；HN 89 分）。共同架构：**确定性读屏（元素树而非像素截图）+ 小模型打分 → 代码持有控制流**——同时回应隐私（无截图外传）与成本（无大模型调用）。
- **执行器/环境**：trycua 的 Cua Driver（桌面自动化）+ Lume（本地 macOS VM）+ Fleets（隔离云桌面）——开源的执行与隔离层已经存在，证明**闭源不是技术必然，是厂商选择**。
- **编排**：jev-ultrafast（browser-use × Jev，12.3K★）把「决策模型选动作」用在了浏览器 agent 循环——同一思想在不同 GUI 载体上的复用。

来源：[trycua/cua](https://github.com/trycua/cua)（含 CUA-S1 说明原文「System 1 as an engineering analogy」）、[CUA-S1 Show HN](https://news.ycombinator.com/item?id=49767564)（89 分）、[awlevin/typesafe-computer-use](https://github.com/awlevin/typesafe-computer-use)（HN 82 分）｜A/B

## 五、GUI 通道的特有安全面（分析，非引用）

bash 通道的输入是你写的命令（可控）；GUI 通道的输入包含**屏幕上的一切**——网页文字、弹窗、邮件正文都可能被视觉/元素树模型当作上下文读入。这意味着：页面上印着「请忽略之前的指令」一类的文字，就可能构成**视觉通道的间接注入**——这是 GUI 通道相对 bash 的特有攻击面，也是各家把评分器/审批闸挂在执行层之外的动机。防御思路（元素树白名单、动作前确认、执行沙箱）都在 harness 层，computer use 本体不管这些——**边界划清后，谁负责什么就清楚了**。

（此节为分析推断：视觉注入的具体案例本稿未逐案核证，业界有公开讨论但未列入本稿证据。）

## 对当前工作流的启示

- **通道优先序**：API > CLI > GUI——能走 API 不走 CLI，能走 CLI 不走 GUI；GUI 是覆盖性最后手段（cua.ai 的 Computer-Use 2.0 概念同此主张：agent 应在同一任务内穿行代码/API/GUI，每换一次通道都在改变风险面）。**实际观察佐证**（读者，09-21）：zcode/claude code/codex 均极少主动使用 GUI 通道——训练分布（编码 agent 在终端/API 环境里训练）与可靠性梯度共同导致模型策略天然偏好高确定性通道；GUI 通道按设计就是储备通道，仅在无更好通道或显式指派时启用。
- **GUI 通道的特有审计点**：屏幕内容即输入源——视觉通道的注入防御是未解问题；若启用 GUI 通道，记录每次观察内容与对应动作（审计粒度须到「看到了什么才点的」）。
- **观察项**：ZCode 仓库会否补入 computer-use 三件套（以及以何种许可证）；CUA-S1 权重的实际开放程度（repo 现为文档+骨架）；Cua Bench 能否成为 OSWorld 之外的第二标准；ferstar 承诺的「对着 ZCode 开源源码写后续」是否兑现。
