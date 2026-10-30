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
 * 本文件同时导出 planTracking / applyTrackingPlan 供 scripts/publish-tracking.mjs
 * 做「选定文件 + 只读计划」编排；默认无参数运行仍是原来的全量同步语义。
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

const SCRIPT_FILE = fileURLToPath(import.meta.url)
export const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), '..')
export const DEFAULT_TRACKING_SRC = 'D:/学习笔记/前沿追踪/hot news'

export const HOT_RE = /^(\d{4}-\d{2}-\d{2})-热点追踪(?:-(\d+))?\.md$/
export const TOPIC_RE = /^(\d{4}-\d{2}-\d{2})-专题-(.+)\.md$/
const REF_RE = /20\d{2}-\d{2}-\d{2}-(?:热点追踪(?:-\d+)?|专题-[^)\s\]]+?)\.md/g

/** 源文件名 -> {kind, date, slug}；命名不符返回 null */
export function classifyTrackingFile(fileName) {
  const hot = fileName.match(HOT_RE)
  if (hot) return { kind: 'hotnews', date: hot[1], slug: hot[2] ? `${hot[1]}-${hot[2]}` : hot[1] }
  const topic = fileName.match(TOPIC_RE)
  if (topic) return { kind: 'topic', date: topic[1], slug: `${topic[1]}-${topic[2]}` }
  return null
}

const yamlQuote = (s) => `'${s.replace(/'/g, "''")}'`

/** 交叉引用改写：目标重写 / 标签去 .md / 裸引用补链接 */
function rewriteReferences(md, fileName, classified, warn) {
  const refToSiteUrl = (refName) => {
    const info = classified.get(refName)
    return info ? `/tracking/${info.slug}` : null
  }
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

/**
 * 去掉「检索覆盖说明」整节：该节只留在工作区原稿，不作为对外内容发布。
 * 删到下一个标题（一至三级）为止；顺带清掉遗留的空行与孤立分隔线。
 */
function stripCoverageSection(body) {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => /^##\s*检索覆盖说明\s*$/.test(line))
  if (start === -1) return { body, removed: false }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s+/.test(lines[i])) {
      end = i
      break
    }
  }
  const head = lines.slice(0, start)
  while (head.length && head[head.length - 1].trim() === '') head.pop()
  while (head.length && head[head.length - 1].trim() === '---') {
    head.pop()
    while (head.length && head[head.length - 1].trim() === '') head.pop()
  }
  const tail = lines.slice(end)
  const merged = tail.length ? [...head, '', ...tail] : head
  return { body: merged.join('\n'), removed: true }
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
function convertSource(fileName, raw, classified, warn) {
  const info = classified.get(fileName)
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
  body = stripCoverageSection(body).body
  body = rewriteReferences(body, fileName, classified, warn)
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

function readInventory(srcDir) {
  if (!fs.existsSync(srcDir)) {
    return { ok: false, error: `源目录不存在：${srcDir}`, sources: [], classified: new Map(), skipped: [] }
  }
  const sources = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'))
  const classified = new Map()
  const skipped = []
  for (const f of sources) {
    const info = classifyTrackingFile(f)
    if (info) classified.set(f, info)
    else skipped.push(f)
  }
  return { ok: true, sources, classified, skipped }
}

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
    : []

const toDestRel = (info) =>
  path.join('src', 'content', 'tracking', info.kind === 'hotnews' ? 'hotnews' : 'topics', `${info.slug}.md`)

function invalidSelectedName(fileName) {
  if (typeof fileName !== 'string' || !fileName) return '文件名必须是非空字符串'
  if (path.isAbsolute(fileName)) return '不得使用绝对路径'
  if (/[/\\]/.test(fileName)) return '不得包含路径分隔符'
  if (fileName === '.' || fileName === '..') return '不得使用相对路径片段'
  if (!fileName.endsWith('.md')) return '必须是 .md 文件'
  return null
}

/**
 * 只读计划：计算转换结果、目标状态、警告、错误与孤儿副本，绝不写盘。
 *
 * @param {object} options
 * @param {string} [options.repoRoot] 仓库根（默认脚本上一级）
 * @param {string} [options.srcDir]   源目录（默认 TRACKING_SRC 或 D:/学习笔记/前沿追踪/hot news）
 * @param {string[]|null} [options.files] 选定的源文件名；null/undefined = 全量（兼容旧 CLI）
 */
export function planTracking({ repoRoot = DEFAULT_REPO_ROOT, srcDir, files = null } = {}) {
  const root = path.resolve(repoRoot)
  const source = path.resolve(srcDir ?? process.env.TRACKING_SRC ?? DEFAULT_TRACKING_SRC)
  const destDir = path.join(root, 'src/content/tracking')
  const inventory = readInventory(source)
  const errors = []
  if (!inventory.ok) errors.push(inventory.error)

  let selected = []
  if (files === null || files === undefined) {
    selected = [...inventory.classified.keys()]
  } else if (!Array.isArray(files)) {
    errors.push('files 必须是文件名数组')
  } else if (files.length === 0) {
    errors.push('未指定任何 --file（拒绝隐式全量同步/发布）')
  } else {
    const seen = new Set()
    for (const fileName of files) {
      const invalid = invalidSelectedName(fileName)
      if (invalid) {
        errors.push(`${invalid}：${String(fileName)}`)
        continue
      }
      if (seen.has(fileName)) continue
      seen.add(fileName)
      const absolute = path.join(source, fileName)
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        errors.push(`源文件不存在：${fileName}`)
        continue
      }
      if (!inventory.classified.has(fileName)) {
        errors.push(`文件名不符合约定（无法推导 slug）：${fileName}`)
        continue
      }
      selected.push(fileName)
    }
    if (selected.length === 0 && errors.length === 0) errors.push('未选定任何有效文件')
  }

  // 校验失败时不做任何转换，避免把半份计划交给上层。
  if (errors.length) {
    return {
      srcDir: source,
      destDir,
      files: [],
      skipped: inventory.skipped,
      warnings: [],
      errors,
      orphans: [],
      ok: false
    }
  }

  const warnings = []
  const warn = (file, msg) => warnings.push(`${file}: ${msg}`)
  const items = []
  for (const fileName of selected) {
    const info = inventory.classified.get(fileName)
    const raw = fs.readFileSync(path.join(source, fileName), 'utf8')
    const before = warnings.length
    const output = convertSource(fileName, raw, inventory.classified, warn)
    const destRel = toDestRel(info)
    const destFile = path.join(root, destRel)
    const exists = fs.existsSync(destFile)
    const old = exists ? fs.readFileSync(destFile, 'utf8') : null
    const status = !exists ? 'added' : old === output ? 'unchanged' : 'updated'
    items.push({
      file: fileName,
      kind: info.kind,
      date: info.date,
      slug: info.slug,
      destFile,
      destRel,
      status,
      output,
      warnings: warnings.slice(before)
    })
  }

  // 孤儿检测基于完整源清单（即使只选了一个文件），只报告不删除。
  const expected = new Set(
    [...inventory.classified.values()].map((info) =>
      path.join(destDir, info.kind === 'hotnews' ? 'hotnews' : 'topics', `${info.slug}.md`)
    )
  )
  const orphans = walk(destDir)
    .filter((f) => f.endsWith('.md') && !expected.has(f))
    .map((f) => path.relative(root, f))
    .sort()

  return {
    srcDir: source,
    destDir,
    files: items,
    skipped: inventory.skipped,
    warnings,
    errors: [],
    orphans,
    ok: warnings.length === 0
  }
}

function writePlanItems(plan) {
  const written = []
  const unchanged = []
  for (const item of plan.files) {
    if (item.status === 'unchanged') {
      unchanged.push(item.destRel)
      continue
    }
    fs.mkdirSync(path.dirname(item.destFile), { recursive: true })
    fs.writeFileSync(item.destFile, item.output)
    written.push(item.destRel)
  }
  return { written, unchanged }
}

/** 写盘（仅计划中的新增/更新）；计划有错误或警告时拒绝写。 */
export function applyTrackingPlan(plan) {
  if (plan.errors.length) throw new Error(`计划存在错误，拒绝写盘：${plan.errors.join('；')}`)
  if (plan.warnings.length) throw new Error(`计划存在警告，拒绝写盘：${plan.warnings.join('；')}`)
  return writePlanItems(plan)
}

// ---- 默认 CLI：保持旧版无参数全量同步的输出与语义 ----
function runLegacyCli() {
  const plan = planTracking({ files: null })
  if (plan.errors.length) {
    for (const error of plan.errors) console.error(`[!] ${error}`)
    process.exitCode = 1
    return
  }

  const stats = { added: [], updated: [], unchanged: [], skipped: plan.skipped, warnings: plan.warnings }
  for (const item of plan.files) {
    if (item.status === 'unchanged') stats.unchanged.push(item.destFile)
    else {
      fs.mkdirSync(path.dirname(item.destFile), { recursive: true })
      fs.writeFileSync(item.destFile, item.output)
      ;(item.status === 'added' ? stats.added : stats.updated).push(item.destRel)
    }
  }

  console.log(`源目录: ${plan.srcDir}`)
  console.log(
    `新增 ${stats.added.length} / 更新 ${stats.updated.length} / 未变 ${stats.unchanged.length} / 跳过 ${stats.skipped.length}`
  )
  if (stats.added.length) console.log(`[+] ${stats.added.join('\n[+] ')}`)
  if (stats.updated.length) console.log(`[~] ${stats.updated.join('\n[~] ')}`)
  if (stats.skipped.length) console.log(`[S] 跳过（命名不符）:\n    ${stats.skipped.join('\n    ')}`)
  if (plan.orphans.length)
    console.log(`[?] 孤儿副本（源已删除/改名，确认后手动清理）:\n    ${plan.orphans.join('\n    ')}`)
  if (stats.warnings.length) {
    console.log(`[!] 警告 ${stats.warnings.length} 条:`)
    for (const w of stats.warnings) console.log(`    ${w}`)
    process.exitCode = 1
  }
  console.log('完成。')
}

function invokedDirectly() {
  if (!process.argv[1]) return false
  const invoked = path.resolve(process.argv[1])
  const self = path.resolve(SCRIPT_FILE)
  return process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self
}

if (invokedDirectly()) {
  runLegacyCli()
}
