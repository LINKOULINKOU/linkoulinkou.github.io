#!/usr/bin/env node
/**
 * 前沿追踪产物 -> 博客站点 单向同步脚本（幂等）
 *
 * 源（唯一事实源，只读）：D:/学习笔记/前沿追踪/hot news/*.md
 * 目标（生成物，勿手改） ：<repo>/src/content/tracking/{hotnews,topics}/*.md
 *
 * 用法：bun scripts/sync-tracking.mjs
 *   TRACKING_SRC=/path/to/dir 可覆盖源目录
 *
 * 转换规则（详见 SITE-INDEX.md §8）：
 *   1. 注入 frontmatter：title / date / kind
 *   2. 去掉首行一级标题（标题进 frontmatter）
 *   3. 站内交叉引用：链接目标重写为 /tracking/<slug>；可见文本去掉 .md 后缀；
 *      裸引用（未加链接的 `YYYY-MM-DD-类型.md`）自动补成站内链接（仅当目标存在）
 *   4. 文件头部的调研信息引用块折叠为默认收起的 <details>
 *   5. 金额 $ 转义为 \$（跳过代码块与行内代码），避免 remark-math 误判为公式
 *   6. 内容不变则不写盘；名称不符合约定的文件跳过并警告
 *   7. 报告站内孤儿副本（源已删除/改名而站内残留的生成物，只报告不删除）
 *   8. 同日多窗口：`YYYY-MM-DD-热点追踪-<n>.md` 映射为 slug `YYYY-MM-DD-<n>`（同日独立第二份报告用）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.resolve(process.env.TRACKING_SRC ?? 'D:/学习笔记/前沿追踪/hot news')
const DEST_DIR = path.join(REPO_ROOT, 'src/content/tracking')

const HOT_RE = /^(\d{4}-\d{2}-\d{2})-热点追踪(?:-(\d+))?\.md$/
const TOPIC_RE = /^(\d{4}-\d{2}-\d{2})-专题-(.+)\.md$/
const REF_RE = /20\d{2}-\d{2}-\d{2}-(?:热点追踪(?:-\d+)?|专题-[^)\s\]]+?)\.md/g

const stats = { added: [], updated: [], unchanged: [], skipped: [], warnings: [] }
const warn = (file, msg) => stats.warnings.push(`${file}: ${msg}`)

// ---- 源清单与命名映射 ----
if (!fs.existsSync(SRC_DIR)) {
  console.error(`[!] 源目录不存在：${SRC_DIR}`)
  process.exit(1)
}
const SOURCES = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.md'))

/** 源文件名 -> {kind, date, slug}；命名不符返回 null */
function classify(fileName) {
  const hot = fileName.match(HOT_RE)
  if (hot) return { kind: 'hotnews', date: hot[1], slug: hot[2] ? `${hot[1]}-${hot[2]}` : hot[1] }
  const topic = fileName.match(TOPIC_RE)
  if (topic) return { kind: 'topic', date: topic[1], slug: `${topic[1]}-${topic[2]}` }
  return null
}

const CLASSIFIED = new Map()
for (const f of SOURCES) {
  const info = classify(f)
  if (info) CLASSIFIED.set(f, info)
  else stats.skipped.push(f)
}

/** 引用名（含 .md）-> 站内路径；不在本批源清单返回 null */
const refToSiteUrl = (refName) => {
  const info = CLASSIFIED.get(refName)
  return info ? `/tracking/${info.slug}` : null
}

// ---- 转换 ----
const yamlQuote = (s) => `'${s.replace(/'/g, "''")}'`

/** 交叉引用改写：目标重写 / 标签去 .md / 裸引用补链接 */
function rewriteReferences(md, fileName) {
  // A. 链接目标 ](name.md) -> ](/tracking/slug)
  md = md.replace(
    /\]\((?:\.\/)?(20\d{2}-\d{2}-\d{2}-(?:热点追踪(?:-\d+)?|专题-[^)#\s]+?))\.md(#[^)\s]*)?\)/g,
    (whole, name, hash = '') => {
      const url = refToSiteUrl(`${name}.md`)
      if (!url) {
        warn(fileName, `链接目标不在源清单：${name}.md`)
        return whole
      }
      return `](${url}${hash})`
    }
  )
  // B. 链接标签 [name.md](...) -> [name](...)
  md = md.replace(
    /\[(20\d{2}-\d{2}-\d{2}-(?:热点追踪(?:-\d+)?|专题-[^\]]+?))\.md\](?=\()/g,
    (whole, name) => (refToSiteUrl(`${name}.md`) ? `[${name}]` : whole)
  )
  // C. 裸引用（不在方括号内）：补站内链接并去掉 .md
  md = md.replace(/(?<!\[)20\d{2}-\d{2}-\d{2}-(?:热点追踪(?:-\d+)?|专题-[^)\s\]]+?)\.md/g, (whole) => {
    const url = refToSiteUrl(whole)
    if (!url) {
      warn(fileName, `裸引用不在源清单：${whole}`)
      return whole
    }
    return `[${whole.slice(0, -3)}](${url})`
  })
  return md
}

/** 文件头部的调研信息引用块（连续 > 行）折叠为 <details> */
function foldHeaderNote(body) {
  const lines = body.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  if (!(lines[i] ?? '').startsWith('>')) return { body, folded: false }
  const start = i
  while (i < lines.length && lines[i].startsWith('>')) i++
  const block = lines.slice(start, i).join('\n')
  const out = [
    ...lines.slice(0, start),
    '<details class="tracking-note">',
    '<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>',
    '',
    block,
    '',
    '</details>',
    ...lines.slice(i)
  ].join('\n')
  return { body: out, folded: true }
}

/**
 * 转义金额里的 $（否则会被 remark-math 当作行内公式），
 * 跳过代码围栏与行内代码段；返回需要上层告警的边界情况。
 */
function escapeDollars(body) {
  const lines = body.split('\n')
  let fenceChar = '' // '' = 不在围栏内
  let fenceLen = 0
  let oddLine = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (m) {
      const char = m[1][0]
      if (!fenceChar) {
        fenceChar = char
        fenceLen = m[1].length
      } else if (char === fenceChar && m[1].length >= fenceLen) {
        fenceChar = ''
        fenceLen = 0
      }
      continue
    }
    if (fenceChar) continue
    const ticks = (line.match(/`/g) ?? []).length
    if (ticks % 2 === 1 && !oddLine) oddLine = line.slice(0, 60)
    lines[i] = line
      .split('`')
      .map((seg, idx) => (idx % 2 === 0 ? seg.replace(/(?<!\\)\$/g, () => '\\$') : seg))
      .join('`')
  }
  return { md: lines.join('\n'), unclosedFence: !!fenceChar, oddBackticks: oddLine }
}

/** 单个源文件 -> {frontmatter+content} 字符串 */
function convert(fileName, raw) {
  const info = CLASSIFIED.get(fileName)
  let md = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  // 首行一级标题
  const lines = md.split('\n')
  let h1Index = 0
  while (h1Index < lines.length && lines[h1Index].trim() === '') h1Index++
  const h1Line = lines[h1Index] ?? ''
  if (!h1Line.startsWith('# ')) {
    warn(fileName, '未找到首行一级标题，按空标题处理')
  }
  const h1Text = h1Line.replace(/^#\s+/, '').trim()
  let title = h1Text
  if (info.kind === 'hotnews') {
    const m = h1Text.match(/^热点追踪｜(\d{4}-\d{2}-\d{2})｜(.+)$/)
    if (m) {
      title = m[2]
      if (m[1] !== info.date) warn(fileName, `标题日期(${m[1]})与文件名日期(${info.date})不一致`)
    } else {
      warn(fileName, `标题不符合「热点追踪｜日期｜主线」格式：${h1Text}`)
    }
  } else {
    const m = h1Text.match(/^专题调研｜(.+)$/)
    if (m) title = m[1]
    else warn(fileName, `标题不符合「专题调研｜标题」格式：${h1Text}`)
  }

  let body = lines.slice(h1Index + 1).join('\n')
  body = rewriteReferences(body, fileName)
  const { md: escapedBody, unclosedFence, oddBackticks } = escapeDollars(body)
  if (unclosedFence) warn(fileName, '代码围栏未闭合（$ 转义已按行状态处理，请核查该文件）')
  if (oddBackticks) warn(fileName, `反引号数为奇数的行（$ 转义可能不完整）：${oddBackticks}`)
  const folded = foldHeaderNote(escapedBody)
  if (!folded.folded) warn(fileName, '文件头未找到可折叠的引用块（> 行）')

  // 终检：不应残留任何产品文件引用
  const leftover = [...folded.body.matchAll(REF_RE)]
  for (const m of leftover) warn(fileName, `残留引用未改写：${m[0]}`)

  return `---\ntitle: ${yamlQuote(title)}\ndate: ${info.date}\nkind: ${info.kind}\n---\n\n${folded.body.replace(/^\n+/, '').replace(/\n*$/, '')}\n`
}

// ---- 执行 ----
for (const fileName of [...CLASSIFIED.keys()]) {
  const info = CLASSIFIED.get(fileName)
  const raw = fs.readFileSync(path.join(SRC_DIR, fileName), 'utf8')
  const output = convert(fileName, raw)
  const destFile = path.join(DEST_DIR, info.kind === 'hotnews' ? 'hotnews' : 'topics', `${info.slug}.md`)
  fs.mkdirSync(path.dirname(destFile), { recursive: true })
  const exists = fs.existsSync(destFile)
  const old = exists ? fs.readFileSync(destFile, 'utf8') : null
  if (exists && old === output) stats.unchanged.push(destFile)
  else {
    fs.writeFileSync(destFile, output)
    ;(exists ? stats.updated : stats.added).push(path.relative(REPO_ROOT, destFile))
  }
}

// ---- 孤儿副本检测（站内存在、源已删除/改名）----
const expected = new Set(
  [...CLASSIFIED.values()].map((info) =>
    path.join(DEST_DIR, info.kind === 'hotnews' ? 'hotnews' : 'topics', `${info.slug}.md`)
  )
)
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
        )
    : []
const orphans = walk(DEST_DIR)
  .filter((f) => f.endsWith('.md') && !expected.has(f))
  .map((f) => path.relative(REPO_ROOT, f))
  .sort()

// ---- 报告 ----
console.log(`源目录: ${SRC_DIR}`)
console.log(`新增 ${stats.added.length} / 更新 ${stats.updated.length} / 未变 ${stats.unchanged.length} / 跳过 ${stats.skipped.length}`)
if (stats.added.length) console.log(`[+] ${stats.added.join('\n[+] ')}`)
if (stats.updated.length) console.log(`[~] ${stats.updated.join('\n[~] ')}`)
if (stats.skipped.length) console.log(`[S] 跳过（命名不符）:\n    ${stats.skipped.join('\n    ')}`)
if (orphans.length) console.log(`[?] 孤儿副本（源已删除/改名，确认后手动清理）:\n    ${orphans.join('\n    ')}`)
if (stats.warnings.length) {
  console.log(`[!] 警告 ${stats.warnings.length} 条:`)
  for (const w of stats.warnings) console.log(`    ${w}`)
  process.exitCode = 1
}
console.log('完成。')
