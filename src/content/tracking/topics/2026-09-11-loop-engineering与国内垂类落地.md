---
title: 'loop engineering：术语定义、争议光谱与国内垂类落地'
date: 2026-09-11
kind: topic
---

<details class="tracking-note">
<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>

> 调研日期：2026-09-11；最近修订：2026-09-13 13:25（09-13 同日三轮：上午 3 路子代理补回「招聘市场信号」为条目 5–7；下午经读者指引入 NCSS 免登录接口做大样本统计并修正两处过量断言；此后按读者指正重写条目 5–7——对准专题主线「loop engineering 国内落地到哪一层」、回答读者原始问题并压减统计堆砌，正文层指标以含 harness/loop engineering 词表的复跑快照为准）
> 本次操作：跨天补充调研 + 同日三轮重构（用户指定编辑本稿；条目 5–7 为 09-13 新回源核查，条目 1–4 沿用 09-11 结论未重核）
> 核心问题：① loop engineering 指什么、反方在反对什么；② 开 harness SDK 的风向能否说明 harness 工程正在转向 loop engineering；③ 国内真正做 agent 应用的企业（垂类方向）实际情况如何；④（读者 09-13 问）中小公司围绕开源 harness 做 loop engineering 卖 B 端是否成为趋势；⑤（读者 09-13 问）为什么 JD 还在要求 LangChain/LangGraph、不同背景公司的 JD 有何差异——④⑤是「loop engineering 国内落地到哪一层」的招聘侧证据
> 核查范围：术语原始出处与采用方（Osmani/IBM/LangChain/codecentric）、反方四家（Akita/StationX/Black Matter VC/社区）、国内垂类报道与咨询报告、兆企 WorkMate 一手采访；历史追溯：2026-06（术语诞生）至 2026-09-11。09-13 补充：国内 JD（腾讯/智联/NCSS/美的/杰瑞/第一财经/知乎）、开源 harness 仓库与融资公告、LangChain 官方博客与 SO 2025 调查；09-13 第二轮：NCSS 免登录接口大样本统计（456 标题/80 正文，接口配方见检索手册）
> 调研方式：WebSearch（中英文）、WebFetch 原文、HN Algolia、curl；09-13 补充：子代理×3 + 主会话亲测抽查；09-13 第二轮起：NCSS AJAX 接口枚举与详情抓取（主会话探配方 + 子代理×2 统计 + 主会话三次抽查复核；正文层指标以含 harness/loop engineering 词表的复跑快照为准，配方见检索手册）。证据缺口：BOSS直聘/猎聘正文登录墙，社招全市场频率无法测得，NCSS 池偏校招与研发岗；美的/杰瑞 JD 为搜索快照未复核全文；列表按更新时间滚动，比例仅在快照内成立

</details>



## 先回答问题

- **loop engineering 指什么**：把「给 agent 写提示词的人」替换为「设计触发-验证-迭代系统的人」——定义目的，让 AI 迭代直到完成。术语由 Addy Osmani 2026-06-07 提出，IBM、LangChain、CodeRabbit 等已采用，Claude Code 作者 Boris Cherny 以「我的工作就是写 loops」背书，Andrew Ng 称其为 hot buzzphrase（A/B；见条目 1）。
- **反方在反对什么**：反对的是**概念包装**（新学科叙事、方法论变现、普适推销），不是实践本身——反方主力中两家明确「反包装、支持实践」，最狠的 Akita 也只额外反对被其数据证伪的特定架构做法（多代理编排、spec-driven），而他自己的替代方案就是极简 loop（B/C；见条目 2）。
- **国内垂类实况**：企业采用率超 50% 但仅 14% 进入生产；玩家是行业 know-how 持有者（垂直 SaaS/RPA 老兵、大厂子公司、细分初创、行业甲方自建），**验证器（行业验收标准）是护城河**；代表样本为塑化行业供应链甲方自建并开源的 WorkMate（B/C；见条目 4）。
- **「中小公司围绕开源 harness 做 loop engineering 卖 B 端」是不是趋势**：还不是。你在招聘平台看到的「熟悉 harness」实测是两种东西：要么「会用编码代理工具」（Cursor/Claude Code 等，列在加分项），要么公司自研 harness 的研发岗（阿里国际、华为、金蝶，连财税 SaaS 云帐房都设了岗）；而「点名熟悉某个开源 harness 产品」（Hermes/pi/OpenHands 等）在 456 条职位标题 + 80 条正文里命中为 0。开源 harness 商业化的现状是「原厂企业化（OpenHands/Cline 融资、goose 入 Linux 基金会）+ 海外白标萌芽（Kilo 分叉 OpenCode）」，国内「二开打包卖 B 端」无具名实证；真实存在的「二开+私有化」需求对象是 Dify/Coze 类应用框架，集中在社招交付岗（A/B；见条目 5–6）。
- **为什么 JD 还在要求 LangChain/LangGraph**：因为它没死——2025-10 刚发 1.0 稳定版、开发者调查中 agent 开发者使用率 33%、刚完成 \$125M 融资成独角兽；且它仍是国内研发岗正文的第一框架词（45%）。「LangChain/LangGraph/Dify/Coze」并排的清单是社招交付岗的标记（研发岗正文几乎不提 Dify/Coze），HR 互相抄模板让清单更整齐，但「为什么是它」的答案是它仍在役（A/B/C；见条目 7）。
- **公司背景分层**（你的分析框架，实测成立）：AI 原生=职位名即业务、点名竞品（DeepSeek「对标 Claude Code」）；垂类公司=把 harness 能力项写进正文（财税 SaaS 云帐房要求上下文管理与 Context Engineering、显示制造商康冠要求「Agent Harness 底层框架」）；大厂 ToB=清单+ROI 话术（腾讯 FDE）；传统行业与集成商=堆平台名词、不提评测（斯马特、杰瑞、神州数码）。判断一家公司是否真做 agent，看正文有没有上下文/记忆/评测这类能力项，别看清单长度（A/B；见条目 5、7）。


## 详细解释与证据

### 1. 术语定义与谱系

Osmani 定义：「loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead.」一个 loop = 递归目标：定义目的，AI 迭代直到完成。五件套 + 状态：automations（定时发现/分诊）、worktrees（并行隔离）、skills（项目知识）、connectors（MCP 接 issue/Slack/CI）、sub-agents（写手/审查者分离），状态外置磁盘（「模型在两次运行之间全忘，记忆必须在盘上不在上下文里」）。与 harness 的关系：「比 harness 高一层」——harness 塑造单个 agent 的环境，loop 是「装上定时器、会派生小助手、自己喂养自己」的 harness。谱系叙事：prompt → context → harness → loop engineering；Steinberger：「你应该设计的是给 agent 提示词的 loops」。产品映射现成：Codex 的 Automations//goal/TOML 子代理，Claude Code 的 cron/loop、hooks、`.claude/agents/` 子代理。（09-13 更新：该词已进入国内校招 JD 原文——希音 2027 届 Agent 开发工程师岗要求「了解并熟悉 RAG/Harness/looping engineering 等前沿 agent 开发理念」，见条目 5。）

来源：[Loop Engineering](https://addyosmani.com/blog/loop-engineering/)｜Addy Osmani｜2026-06-07｜A（术语原始出处）；[IBM: What Is Loop Engineering](https://www.ibm.com/think/topics/loop-engineering)、[codecentric 术语辨析](https://www.codecentric.de/en/knowledge-hub/blog/loop-harness-context-engineering-explained)、[LangChain: The Art of Loop Engineering](https://www.langchain.com/blog/the-art-of-loop-engineering)｜厂商/咨询｜B（定义采用与引申）

### 2. 反方光谱：反对的是包装，不是实践

- **AkitaOnRails（Fabio Akita，2026-08-18，最狠）**：核心句「技术变成 commodity，钱就迁移到 taxonomy」。带自测基准：harness 只对弱模型有用（Grok 4.3 裸跑 18 分 vs 原生 CLI 55 分），前沿模型差异 1 分内；成本杠杆与档位无关（11M tokens 官方 CLI \$1.19 vs OpenRouter \$6.33，原生 prompt cache 所致）；多代理数学不成立（单步 90% × 10 步 ≈ 35%；MiniMax M3 套编排器 24 分/裸跑 91 分——「系统是编排器，模型只是戏服」）；引 Cognition《Don't Build Multi-Agents》、Anthropic 自认多代理 15× token 燃烧且 80% 收益来自更多 token、伯克利 68% 生产 agent ≤10 步；spec-driven = Waterfall 2.0；Gartner「agent washing」（几千家 agentic AI 公司约 130 家为真）。替代方案：Agile Vibe Coding（XP + LLM）+ 自研 ai-memory。挑战书：5 个月 30+ 公开仓库——「拿出你们的项目来」。
- **StationX（Nathan House，2026-06）**：loop 形状（触发→工作→验证→反馈）是老控制环（TDD、CI 跑到绿、15 年前的 SOAR playbook）；「cron 只是触发器，祖先是控制环」。真升级两点：模糊容忍（定义终点，智能吸收路径混乱）+ loop 会自己找工作。结论「大部分是换皮，外加一次真升级」。
- **Black Matter VC（Michael Rouveure，2026-07-05 更新）**：每天跑生产 agent swarm，六原语与 Osmani 五件套几乎重合。判决「真杠杆，不是 hype，但窄门」：四条准入（任务周频重复、机器能拒绝坏输出、预算烧得起浪费、agent 已有高级工程师工具）；maker/checker 分离是「整个游戏」；失效区=一切「完成」是判断题的活（架构/auth/支付/生产部署）；成本 loop ~4× 对话、多代理 15×（引 Oracle），Uber 四个月烧光 2026 AI 预算后限 \$1500/月；对批评潮的回应：「批评落在弱 loop 上——没验证器、没花费上限」，原语（ReAct）确实老，新的是调度+验证器+预算；静默风险为 comprehension debt 与 cognitive surrender。
- **社区情绪（C）**：Reddit r/ClaudeCode「loop engineering === psyop」帖；LinkedIn「你不理解的系统无法被修改、监管和控制」；HN 成本血泪（24 小时烧 60% 周配额）。声量对比：反方转发 4-5 分，正方实践帖 37 分，HN 生态偏正方。

**共同结论**：无一家反对「在验证与预算约束下自动循环干活」本身；争议集中在术语的学科地位、方法论变现与适用范围。Rouveure 对批评潮的定性（「落在弱 loop 上」）与 Akita 的替代方案（外置状态+测试+CI）恰说明：反方的净立场是「把仪式去掉，把窄条件留足」。

来源：[Hot Take: Harness, Loop Engineering, Graph Engineering Are Bullshit](https://akitaonrails.com/en/2026/08/18/hot-take-harness-loop-engineering-graph-engineering-are-bullshit/)｜Fabio Akita｜2026-08-18｜B（基准自报，条件已给）；[Loop Engineering: New Paradigm or Rebranded Cron?](https://app.stationx.net/articles/loop-engineering)｜StationX/Nathan House｜2026-06｜B；[An Honest Verdict From Someone Who Actually Runs Agent Loops](https://blackmatter.vc/lab/loop-engineering-an-honest-verdict-from-someone-who-actually-runs-agent-loops)｜Black Matter VC｜2026-07-05 更新｜B；[r/ClaudeCode: psyop 帖](https://www.reddit.com/r/ClaudeCode/comments/1ugy7w4/loop_engineering_psyop/)｜社区｜C

### 3. 开 harness SDK 的风向＝loop 工程的物质基础（含两次读者修正）

正题：vendor 收编 harness（Agents API 托管运行 Codex harness、自动上下文管理）后，用户侧增量工程上移到 loop 层；vendor 暴露的旋钮本身就是 loop 原语（Automations、`/goal`、scheduled sessions、后台子代理、用量限尽自动续跑）。Cherny/Steinberger 的表态与该产品的重合度即为此说的最好注脚。

**读者修正一（09-11）**：「vendor 管 harness、用户管 loop」的分层只在闭源栈成立；开源 harness（pi、OpenCode、Hermes）上两层是**闭合反馈**——outer loop 跑出的不足直接变成 harness 层的 patch。工作区自证：子代理专题（[2026-09-07-专题-codex-子代理递归条件](/tracking/2026-09-07-codex-子代理递归条件)）正是由 loop 痛点下钻 codex 源码（`spec_plan.rs`/`multi_agents.rs`）完成归因的。

**读者修正二（09-11）**：本专题讨论中曾提出两条边界条件，经指正修正为：① 决策变量是**失败归因**而非模型档位——产出可直测的工作流不存在「跑分边际效益」问题，归因到模型推理才轮到换模型，归因到上下文/工具/验证器则修 harness/loop；成本杠杆与档位无关（同 token 量官方 CLI 与第三方 5 倍差价）。② 维护税**分场景**：个人小补丁可忽略且可 pin 版本；公司可设岗分摊；唯一残留义务是**跟踪安全公告**——harness 安全 bug 的形态（符号链接绕过 deny 规则、插件报错泄露 token）见 [2026-09-10-热点追踪](/tracking/2026-09-10) 条目 3。

三姿态代价标注（修正版）：闭源 vendor 栈=等（issue→release）；开源 harness=养（多数场景养得起，深度决定税额）；托管 API=让渡选择权。选哪种姿态本身是 loop engineering 的决策变量之一。

来源：[Agents API 文档](https://developers.openai.com/api/docs/guides/agents-api/overview)｜OpenAI 官方｜2026-09-10｜A；[HN: OpenAI Agents API 讨论帖](https://news.ycombinator.com/item?id=49649213)｜130 分｜C；读者两次指正｜2026-09-11｜对话记录

### 4. 国内垂类落地实况：行业 know-how 持有者的战场

- **总情**：企业 AI Agent 员工采用率超 50%，但**仅 14% 进入生产环境**（第一新声 Q2 图谱，C）；Gartner 预测 2026 年底 40% 企业应用嵌入 agent（2025 年不足 5%，B 转述）；市场规模 2025 年约 190–212 亿元 → 2026 预计 449 亿 → 2029 年 3320 亿（IDC 口径经转述，C）。财联社产业报道一手采访佐证：「大量企业仍停留在购买大模型账号、尝试简单问答的阶段」（兆企供应链董事长徐琪）。
- **四类玩家**（共同点是持有行业验收标准，而非 agent 技术）：① 垂直 SaaS/RPA 老兵（来也科技、明略科技三层基础设施、金智维-金融运维）；② 大厂子公司（卡奥斯「数字人+智能体」）；③ 细分初创（36氪：行业集中度高，医疗/教育/工业细分仍有独角兽机会）；④ **行业甲方自建**——兆企 WorkMate：中央财经大学与兆企供应链联合开发并开源，塑化行业供应链场景，内部运行近两年（微信报价识别、合同生成、客户画像、风控预警），自报效果报价响应 20 分钟→30 秒、分析报告 4 小时→15 分钟、合同审批 1 天→20 分钟。
- **机制**：垂类护城河 = 验证器（行业验收标准）——标准化流程行业天然满足 Rouveure 四条件，这是「供应链/制造/金融率先商业化突破」（财联社）的原因；徐琪「隔行如隔山」即此意。
- **模型厂商面（背景）**：智谱 2026-01-08 港交所上市，AutoGLM/ZCode（官网自称 GLM-5.3 官方 harness）；MiniMax 上市、M2.5 于海外 Agent 内测；DeepSeek V4 开源且「智能体工作流深度优化」；Kimi K3 成为 Cognition SWE-2 的后训练基座（A，见 [2026-09-11-热点追踪](/tracking/2026-09-11) 条目 2）。

来源：[财联社：40%企业应用或嵌入智能体，供应链领域跑出落地样本](https://www.cls.cn/detail/2409222)｜记者李洁（含兆企徐琪采访）｜原文：2026-06-25｜B（一手采访，效果数据为企业自报）；[第一新声 2026 Q2 图谱](https://zhuanlan.zhihu.com/p/2074201489413780228)｜C；[亿欧 2026 智能体洞察报告](https://www.iyiou.com/news/202605191130207)（IDC 市场规模口径）｜C；36氪《智能体赛道杀出一批未来独角兽》（检索转述，未留直链）｜C；智谱官网 zcode.z.ai、证券时报｜A/B

### 5. 招聘侧证据：harness 成了国内岗位能力词，「熟悉开源 harness 产品」仍为零

你在招聘平台看到的「熟悉开源 harness 框架」，经 NCSS 大样本核对（456 条 Agent 类职位标题 + 80 条正文，09-13 检索）实际是三种不同的东西，公开池里只见到前两种：

- **「会用编码代理工具」**：正文 80 条中仅 3 条点名 Cursor/Claude Code/Codex（另 2 条 Copilot 系泛指），全部列在加分项——希音校招：「对主流 AI 工具（含 AI 编程类工具，claude code/codex/zcode/cursor 等）…有丰富的经验」（A，详情页亲测）。这是工具使用经验，不是框架工程。
- **「公司自研 harness 的研发岗」**：这才是 harness 在国内 JD 的真实形态。标题层 22 条、约 11 家公司（阿里国际、华为、月之暗面、金蝶、中国通号、中科软、多点，及 50–99 人的省心购、成都海艺互娱、语核科技）；正文层 19 条、去重后 6 家。其中两家垂类公司值得注意：**财税 SaaS 云帐房**要求「深度参与 Agent 产品及 Agent Harness 的架构设计与功能实现……Context Engineering、Prompt Engineering、RAG、SFT」；**显示制造商康冠**要求「Agent Harness 架构或底层框架的开发经验……上下文管理、记忆窗口截断、Token 优化」。这些正是条目 3 说的 harness 工程能力项，与条目 4「垂类玩家是行业 know-how 持有者」互相印证——loop engineering 的底层能力正随垂类落地进入国内 JD。
- **「点名熟悉某个开源 harness 产品」（Hermes、pi、OpenHands 等）**：标题与正文命中均为 0。若现实中确有此类 JD，那是宝贵个例，但截至本次检索不构成趋势。

其余统计（支撑上述判定，比例仅在本次快照内成立；同日两次抽样核心词稳定、长尾词波动大）：工具调用 68%、RAG 48%、LangChain 45%、开源 40%、LlamaIndex 35%、多智能体 38%、LangGraph 23%、MCP 21%、评测 15%；Dify 1%、Coze 0；「二次开发/私有化部署」为 0（标题层 14 条「二次开发」全是 CAD/PDM 传统二开）。术语进入招聘语言的直接证据：希音同条 JD 写「RAG/Harness/looping engineering 等前沿 agent 开发理念」（见条目 1）。

来源：NCSS 接口与详情页（配方见检索手册，可复跑）｜检索 2026-09-13｜A；形态例证 jobId：希音 89Xm3unf6Tj1s9EmvVds98、云帐房 XzSS9G7ttMEFSgEbzLmdbo（同岗多渠道重复另 13 条）、清昴智能 h4kHM8xKHkUitwJrihToJ、康冠 X5ZwcUE2uAQcixy5drQvfy、百川 DLRcLo7tcfGXstDY4ezohG、金蝶 GU7mUPro2EXLwpvUi5Pbn1、华为 FCiuc9VMELgqfQ5U25mhWL、省心购 9TH9eYuh33wdW1Rz6wzWF4｜A；社招交付岗清单例证（上午轮公开页）：[腾讯 FDE](https://careers.tencent.com/jobdesc.html?postId=2041772169679241216)（页面 2026-09-07｜A）、[斯马特](https://m.zhaopin.com/jobs/CC591144620J40960242508.htm)（09-13｜A）、[美承存档](https://ncss.cn/student/jobs/TMA7f1dFvc3MTmi8ypo5Fm/detail.html)（A）、[杰瑞](https://jereh.zhiye.com/campus/detail?jobAdId=05b961b9-67b5-4865-9091-bbcb442bd4fb)（快照｜B）、美的（快照｜B）、[第一财经 DeepSeek](https://www.yicai.com/news/103192868.html)（2026-05-20｜B）、[知乎 2025-04 汇总](https://zhuanlan.zhihu.com/p/1896941040927212239)（B）

### 6. 开源 harness 版图：原厂企业化成熟，白标萌芽在海外，国内无二开交付

- **读者听说的三个名字都有真实项目**（GitHub API 亲测，star 为 09-13 值）：pi = `earendil-works/pi`（Mario Zechner，MIT，10.4 万 star）；OpenCode = `anomalyco/opencode`（YC 出身的 Anomaly，20.7 万 star）；Hermes = `NousResearch/hermes-agent`（Nous Research 的通用 agent harness，24.5 万 star，与 Hermes 系列模型同品牌、不同产物）。
- **原厂都把企业生意做起来了**：OpenHands（All Hands AI，open-core，2025-11 官宣 \$18.8M A 轮）；goose（Block 开源，2025-12 捐给 Linux Foundation 新设基金会、转中立治理）；Cline（2025-07 官宣 \$32M + 企业版 Teams）；Hermes（Nous Research，2025-04 \$50M，TechCrunch 2026-07 报道拟再筹 ≥\$75M）；pi 未见公司化。
- **「二开打包卖 B 端」的正例都在海外**：Kilo Code 官方 README 自述「Kilo CLI is a fork of OpenCode」（分叉改造成公司化产品 + 云收费，A，亲测）；Qodo 是 open-core 代表（PR-Agent 开源、主产品企业收费）；白标工具 metaharness 刚出现（宣称可给 10 种宿主 harness 生成自有品牌，v0.1 早期，B）。
- **判定**：这条路的现状是「原厂企业化 + 海外小规模白标」。国内对应的雇佣需求是自研 harness 岗（条目 5）与 Dify/Coze 层二开；「基于开源编码代理 harness 二开交付」中文侧未找到任何具名公司实证，命中项均为软文（C 级不采信），HN「built on OpenHands」相关评论 0 条。

来源：[hermes-agent](https://github.com/NousResearch/hermes-agent)、[pi](https://github.com/earendil-works/pi)、[opencode](https://github.com/anomalyco/opencode)｜2026-09-13 API 亲测｜A；[OpenHands \$18.8M A 轮](https://www.openhands.dev/blog/weve-just-raised-18-8m-to-build-the-open-standard-for-autonomous-software-development)｜2025-11-18｜A；[LF：Agentic AI 基金会](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)｜2025-12-09｜A；Cline \$32M｜cline.blog/GlobeNewswire｜2025-07-31｜A；Nous Research 融资｜SiliconANGLE（2025-04）、TechCrunch（2026-07）｜B；[Kilo CLI README](https://github.com/Kilo-Org/kilocode)、[PR-Agent README](https://github.com/qodo-ai/pr-agent)｜亲测｜A；metaharness｜github.com/ruvnet/metaharness｜B；[HN Who's hiring 帖提及 aider](https://news.ycombinator.com/item?id=48747990)｜2026-07-01｜C

### 7. 为什么 JD 还在要求 LangChain/LangGraph：没退场、仍是第一框架词，清单与模板是放大器

==注释：仍不清楚其具体的一个落地情况，只属于招聘市场的信息，且为什么有开源框架还要去自造轮子这种事情表示不解==

- **它没死**：LangChain 1.0 与 LangGraph 1.0 于 2025-10-22 发布、承诺 2.0 前无破坏性变更，旧全家桶拆为 `langchain-classic`（官方博客亲测）；SO 2025 开发者调查中它是 agent 开发者使用率第二的框架（33%，仅次于 Ollama 51%）；Klarna、Cisco 等案例（官网自报）与 \$125M 独角兽融资（Fortune 2025-10）。读者的「退守」判断对了一半：1.0 把简单场景让给原生 SDK、LangGraph 收缩到有状态长任务——是产品分层，不是消亡。
- **它也仍是国内研发岗正文的第一框架词**：正文抽样 LangChain 45%、LangGraph 23%、LlamaIndex 35%，而 Dify 1%、Coze 0（条目 5）。
- **「四件套」清单是岗位类型标记，不是技术栈事实**：LangChain/LangGraph/Dify/Coze 并排的清单不出现在研发岗正文，而集中在社招交付岗/传统行业转型/集成商（腾讯 FDE、斯马特、美的、杰瑞、美承、神州数码）——写什么清单取决于招什么岗，不取决于公司大小；同一份统计里，公司规模与清单形态无稳定相关。
- **HR 模板复制解释整齐、解释不了选择**：≥5 家共用「精通/熟悉+框架名清单+等主流 AI 框架」句式、与培训课程推荐清单同构（B/C）；知乎 HR 自述「JD 从网上抄模板、东拼西凑」（C）、招聘社区自述每次「basically writing the same thing」（C）。读者的抄袭怀疑成立，但它只是放大器——「为什么是 LangChain」的答案是它仍在役。
- 数据边界：Latenode 帖称 LinkedIn 英文 JD 提及极少（C）与 SO 33% 冲突未核清——JD 提及率随市场/渠道/语种剧烈变化，且无跨季度时间序列，以上数字均不可作趋势外推。

来源：[LangChain 1.0 官方博客](https://www.langchain.com/blog/langchain-langgraph-1dot0)（亲测）｜2025-10-22｜A；[SO 2025 开发者调查 AI 卷](https://survey.stackoverflow.co/2025/ai)（亲测）｜A；[Qodo：为何用 LangGraph 建编码代理](https://www.qodo.ai/blog/why-we-chose-langgraph-to-build-our-coding-agent/)｜2025-03-25｜B；Fortune \$125M｜fortune.com｜2025-10-20｜B；[HeroHunt AI 技能词表](https://www.herohunt.ai/blog/fastest-growing-ai-roles-in-2026-data-and-rankings/)｜2026-03-28｜B；知乎 HR 模板讨论｜zhihu.com/question/13167958363 等｜日期不详｜C；[Latenode 论坛帖](https://community.latenode.com/t/39052)｜2025-08-28｜C；[r/recruiting](https://www.reddit.com/r/recruiting/comments/184g75i/)｜约 2023-11｜C

## 对当前工作流的启示

- **术语纪律已更新**：行业已普遍认可的术语（loop engineering）直接使用、就地解释一次；反方观点作为内容记录（本文件条目 2），不作为术语的固定争议标注。已同步写入写作规范术语表与术语规则。
- **诊断先于选型**：产出可直测的工作流，先归因失败在哪层（模型推理/上下文/工具/验证器），再决定下钻 harness 还是调整 loop；模型档位不作先验，成本杠杆（缓存/接线）与档位无关（见条目 3 修正二）。
- **国内观察点**：WorkMate 型「甲方自建 + 开源框架」路径是否被更多行业复制；「14% 进生产」的鸿沟有无第三方独立证据的收窄；法律垂类（公开着墨最少）何时出现代表案例。
- **把 JD 当 loop engineering 落地位置的观察哨**（09-13 定稿）：harness 能力项（上下文/记忆/工具调用/Token 经济）已随垂类公司进入国内 JD 正文（云帐房、康冠，见条目 5），looping engineering 术语已原文进校招 JD（希音，见条目 1）；而「点名开源 harness 产品」与「二开交付」均为 0——它们何时从 0 变正，就是「中小公司二开卖 B 端」假设升温的可复核信号。NCSS 接口免登录、可季度复跑（配方见检索手册）。
