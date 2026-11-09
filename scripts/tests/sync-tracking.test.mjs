import { test } from 'bun:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  planTracking,
  applyTrackingPlan,
  classifyTrackingFile
} from '../sync-tracking.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP_ROOT = path.join(HERE, '.tmp')

function makeCase(name) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const root = fs.mkdtempSync(path.join(TMP_ROOT, `${name}-`))
  fs.mkdirSync(path.join(root, 'repo', 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  return {
    root,
    repo: path.join(root, 'repo'),
    src: path.join(root, 'src'),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true })
      try {
        fs.rmdirSync(TMP_ROOT)
      } catch {
        // 目录非空（并行测试）时保留
      }
    }
  }
}

function writeSource(src, name, text) {
  fs.writeFileSync(path.join(src, name), text, 'utf8')
}

const HOT = `# 热点追踪｜2026-10-20｜基线测试主线

> 调研日期：2026-10-20
> 调研方式：fixture，仅用于回归基线

## 摘要

金额 $5 与行内代码 \`$code\` 都应保留语义。

参见 2026-10-19-热点追踪.md 与 [旧专题](2026-10-18-专题-示例.md#第一节)。

\`\`\`js
const price = "$9"
\`\`\`
`

const YESTERDAY = `# 热点追踪｜2026-10-19｜昨日主线

> 调研日期：2026-10-19

昨日正文。
`

const TOPIC = `# 专题调研｜示例专题

> 说明：fixture

## 第一节

专题正文，引用 [热点](2026-10-20-热点追踪.md)。
`

// 由改动前的 sync-tracking.mjs 生成，逐字固定，作为默认全量转换的兼容基线。
const EXPECTED_HOT = `---
title: '基线测试主线'
date: 2026-10-20
kind: hotnews
---

<details class="tracking-note">
<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>

> 调研日期：2026-10-20
> 调研方式：fixture，仅用于回归基线

</details>

## 摘要

金额 \\$5 与行内代码 \`$code\` 都应保留语义。

参见 [2026-10-19-热点追踪](/tracking/2026-10-19) 与 [旧专题](/tracking/2026-10-18-示例#第一节)。

\`\`\`js
const price = "$9"
\`\`\`
`

test('计划只包含选定文件，但引用映射仍使用完整源清单且不写盘', () => {
  const c = makeCase('scope')
  try {
    writeSource(c.src, '2026-10-20-热点追踪.md', HOT)
    writeSource(c.src, '2026-10-19-热点追踪.md', YESTERDAY)
    writeSource(c.src, '2026-10-18-专题-示例.md', TOPIC)

    const orphan = path.join(c.repo, 'src/content/tracking/hotnews/2025-01-01.md')
    fs.mkdirSync(path.dirname(orphan), { recursive: true })
    fs.writeFileSync(orphan, 'old', 'utf8')

    const plan = planTracking({
      repoRoot: c.repo,
      srcDir: c.src,
      files: ['2026-10-20-热点追踪.md']
    })

    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.warnings, [])
    assert.deepEqual(plan.files.map((f) => f.file), ['2026-10-20-热点追踪.md'])
    assert.equal(plan.files[0].status, 'added')
    assert.match(plan.files[0].output, /\[旧专题\]\(\/tracking\/2026-10-18-示例#第一节\)/)
    assert.match(plan.files[0].output, /\[2026-10-19-热点追踪\]\(\/tracking\/2026-10-19\)/)

    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-20.md')), false)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-19.md')), false)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics/2026-10-18-示例.md')), false)
    assert.equal(fs.existsSync(orphan), true)
    assert.deepEqual(plan.orphans, [path.join('src', 'content', 'tracking', 'hotnews', '2025-01-01.md')])
  } finally {
    c.cleanup()
  }
})

test('选定文件名校验拒绝路径穿越、不存在文件、非 md 与空选择', () => {
  const c = makeCase('validate')
  try {
    writeSource(c.src, '2026-10-20-热点追踪.md', HOT)
    writeSource(c.src, '说明.txt', 'not a product')

    for (const files of [
      ['../2026-10-20-热点追踪.md'],
      ['2026-10-20-热点追踪.md/../../x.md'],
      ['nope.md'],
      ['说明.txt'],
      []
    ]) {
      const plan = planTracking({ repoRoot: c.repo, srcDir: c.src, files })
      assert.ok(plan.errors.length > 0, `应拒绝：${JSON.stringify(files)}`)
      assert.equal(plan.files.length, 0)
    }
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking')), false)
  } finally {
    c.cleanup()
  }
})

test('applyTrackingPlan 只写选定文件且第二次为未变', () => {
  const c = makeCase('apply')
  try {
    writeSource(c.src, '2026-10-20-热点追踪.md', HOT)
    writeSource(c.src, '2026-10-19-热点追踪.md', YESTERDAY)
    writeSource(c.src, '2026-10-18-专题-示例.md', TOPIC)
    const first = planTracking({
      repoRoot: c.repo,
      srcDir: c.src,
      files: ['2026-10-20-热点追踪.md']
    })
    const applied = applyTrackingPlan(first)
    assert.deepEqual(applied.written, [path.join('src', 'content', 'tracking', 'hotnews', '2026-10-20.md')])
    assert.equal(
      fs.readFileSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-20.md'), 'utf8'),
      EXPECTED_HOT
    )
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)

    const second = planTracking({
      repoRoot: c.repo,
      srcDir: c.src,
      files: ['2026-10-20-热点追踪.md']
    })
    assert.equal(second.files[0].status, 'unchanged')
  } finally {
    c.cleanup()
  }
})

test('文件名分类与既有 slug 映射一致', () => {
  assert.deepEqual(classifyTrackingFile('2026-10-20-热点追踪.md'), {
    kind: 'hotnews',
    date: '2026-10-20',
    slug: '2026-10-20'
  })
  assert.deepEqual(classifyTrackingFile('2026-10-20-热点追踪-2.md'), {
    kind: 'hotnews',
    date: '2026-10-20',
    slug: '2026-10-20-2'
  })
  assert.deepEqual(classifyTrackingFile('2026-10-18-专题-中文-标题.md'), {
    kind: 'topic',
    date: '2026-10-18',
    slug: '2026-10-18-中文-标题'
  })
  assert.deepEqual(classifyTrackingFile('2026-10-20-发布追踪.md'), {
    kind: 'release',
    date: '2026-10-20',
    slug: '2026-10-20-releases'
  })
  assert.equal(classifyTrackingFile('2026-10-20-发布追踪-2.md'), null)
  assert.equal(classifyTrackingFile('2026-10-20-发布追踪-额外标题.md'), null)
  assert.equal(classifyTrackingFile('2026-10-18-随便.md'), null)
})

// 以下发布线内容仅为本地测试夹具，不进入站点生成目录。
const RELEASE = `# 发布追踪｜2026-10-20｜发布线回归夹具

> 说明：fixture，不是真实发布消息

## 发布记录

金额 $3 与行内代码 \`$sample\`。
参见 [同日热点](./2026-10-20-热点追踪.md#摘要)、2026-10-20-热点追踪-2.md，
以及 [2026-10-18-专题-示例.md](2026-10-18-专题-示例.md#第一节)。

## 检索覆盖说明

内部夹具说明，不对外发布。
`

function seedReleaseCase(c) {
  writeSource(c.src, '2026-10-20-发布追踪.md', RELEASE)
  writeSource(c.src, '2026-10-20-热点追踪.md', HOT + `
发布线：[2026-10-20-发布追踪.md](./2026-10-20-发布追踪.md#发布记录)。
另见 2026-10-20-发布追踪.md。
`)
  writeSource(c.src, '2026-10-20-热点追踪-2.md', HOT)
  writeSource(c.src, '2026-10-19-热点追踪.md', YESTERDAY)
  writeSource(c.src, '2026-10-18-专题-示例.md', TOPIC + '\n发布线：2026-10-20-发布追踪.md。\n')
}

const RELEASE_DEST = path.join('src', 'content', 'tracking', 'releases', '2026-10-20-releases.md')

test('发布线独立目录与固定 slug，同日热点/专题映射不变且支持双向引用', () => {
  const c = makeCase('release-links')
  try {
    seedReleaseCase(c)
    const plan = planTracking({ repoRoot: c.repo, srcDir: c.src })
    assert.deepEqual(plan.errors, [])
    assert.deepEqual(plan.warnings, [])
    assert.equal(plan.files.length, 5)
    const release = plan.files.find((item) => item.kind === 'release')
    assert.equal(release.slug, '2026-10-20-releases')
    assert.equal(release.destRel, RELEASE_DEST)
    assert.match(release.output, /^---\ntitle: '发布线回归夹具'\ndate: 2026-10-20\nkind: release\n---/)
    assert.ok(!release.output.includes('# 发布追踪｜'))
    assert.ok(release.output.includes('<details class="tracking-note">'))
    assert.ok(release.output.includes('金额 \\$3 与行内代码 `$sample`'))
    assert.ok(!release.output.includes('检索覆盖说明'))
    assert.ok(!release.output.includes('内部夹具说明'))
    assert.ok(release.output.includes('[同日热点](/tracking/2026-10-20#摘要)'))
    assert.ok(release.output.includes('[2026-10-20-热点追踪-2](/tracking/2026-10-20-2)'))
    assert.ok(release.output.includes('[2026-10-18-专题-示例](/tracking/2026-10-18-示例#第一节)'))
    const hot = plan.files.find((item) => item.slug === '2026-10-20')
    assert.ok(hot.output.includes('[2026-10-20-发布追踪](/tracking/2026-10-20-releases#发布记录)'))
    assert.ok(hot.output.includes('另见 [2026-10-20-发布追踪](/tracking/2026-10-20-releases)。'))
    const topic = plan.files.find((item) => item.kind === 'topic')
    assert.ok(topic.output.includes('发布线：[2026-10-20-发布追踪](/tracking/2026-10-20-releases)。'))
    assert.equal(fs.existsSync(path.join(c.repo, RELEASE_DEST)), false, '计划阶段不写生成物')
    assert.equal(fs.readFileSync(path.join(c.src, '2026-10-20-发布追踪.md'), 'utf8'), RELEASE)
  } finally {
    c.cleanup()
  }
})

test('选定发布线只写自身，重复同步幂等、更新及完整清单孤儿检测正确', () => {
  const c = makeCase('release-apply')
  try {
    seedReleaseCase(c)
    const options = { repoRoot: c.repo, srcDir: c.src, files: ['2026-10-20-发布追踪.md'] }
    const first = planTracking(options)
    assert.deepEqual(first.warnings, [])
    assert.deepEqual(applyTrackingPlan(first).written, [RELEASE_DEST])
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews')), false)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)
    const second = planTracking(options)
    assert.equal(second.files[0].status, 'unchanged')
    assert.deepEqual(applyTrackingPlan(second), { written: [], unchanged: [RELEASE_DEST] })

    writeSource(c.src, '2026-10-20-发布追踪.md', RELEASE.replace('发布线回归夹具', '修订夹具'))
    const updated = planTracking(options)
    assert.equal(updated.files[0].status, 'updated')
    assert.deepEqual(applyTrackingPlan(updated).written, [RELEASE_DEST])
    const orphan = path.join('src', 'content', 'tracking', 'releases', '2025-01-01-releases.md')
    fs.writeFileSync(path.join(c.repo, orphan), 'orphan fixture')
    fs.writeFileSync(path.join(c.repo, 'src/content/tracking/releases/.gitkeep'), '')
    // 即使仅选热点，合法发布线也不是孤儿，真正的孤儿只报告、不删除。
    const hotOnly = planTracking({ ...options, files: ['2026-10-20-热点追踪.md'] })
    assert.deepEqual(hotOnly.orphans, [orphan])
    assert.equal(fs.existsSync(path.join(c.repo, orphan)), true)
    assert.match(fs.readFileSync(path.join(c.repo, RELEASE_DEST), 'utf8'), /title: '修订夹具'/)
  } finally {
    c.cleanup()
  }
})

test('发布线标题格式和日期校验产生警告并拒绝写盘', () => {
  const c = makeCase('release-title')
  try {
    seedReleaseCase(c)
    for (const [header, warning] of [
      ['# 热点追踪｜2026-10-20｜类型错误', '发布追踪｜日期｜主线'],
      ['# 发布追踪｜2026-10-20', '发布追踪｜日期｜主线'],
      ['# 发布追踪｜2026-10-19｜日期错误', '标题日期(2026-10-19)与文件名日期(2026-10-20)不一致']
    ]) {
      writeSource(c.src, '2026-10-20-发布追踪.md', RELEASE.replace(/^# .+/, header))
      const plan = planTracking({ repoRoot: c.repo, srcDir: c.src, files: ['2026-10-20-发布追踪.md'] })
      assert.deepEqual(plan.errors, [])
      assert.ok(plan.warnings.some((item) => item.includes(warning)), plan.warnings.join('\n'))
      assert.throws(() => applyTrackingPlan(plan), /计划存在警告/)
      assert.equal(fs.existsSync(path.join(c.repo, RELEASE_DEST)), false)
    }
  } finally {
    c.cleanup()
  }
})

test('缺失发布线引用告警且终检能发现残留引用', () => {
  const c = makeCase('release-missing-ref')
  try {
    writeSource(c.src, '2026-10-19-热点追踪.md', YESTERDAY + `
[缺失发布记录](2026-10-18-发布追踪.md#发布记录)
另见 2026-10-17-发布追踪.md。
`)
    const plan = planTracking({ repoRoot: c.repo, srcDir: c.src, files: ['2026-10-19-热点追踪.md'] })
    assert.ok(plan.warnings.some((item) => item.includes('链接目标不在源清单：2026-10-18-发布追踪.md')))
    assert.ok(plan.warnings.some((item) => item.includes('裸引用不在源清单：2026-10-17-发布追踪.md')))
    assert.ok(plan.warnings.some((item) => item.includes('残留引用未改写：2026-10-18-发布追踪.md')))
    assert.throws(() => applyTrackingPlan(plan), /计划存在警告/)
  } finally {
    c.cleanup()
  }
})

function runProcess(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: String(error) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

test('无参数 CLI 的全量转换输出与旧版逐字兼容', async () => {
  const c = makeCase('legacy')
  try {
    writeSource(c.src, '2026-10-20-热点追踪.md', HOT)
    writeSource(c.src, '2026-10-19-热点追踪.md', YESTERDAY)
    writeSource(c.src, '2026-10-18-专题-示例.md', TOPIC)
    fs.copyFileSync(path.join(HERE, '..', 'sync-tracking.mjs'), path.join(c.repo, 'scripts', 'sync-tracking.mjs'))

    const result = await runProcess(process.execPath, [path.join(c.repo, 'scripts', 'sync-tracking.mjs')], {
      cwd: c.repo,
      env: { ...process.env, TRACKING_SRC: c.src }
    })
    assert.equal(result.code, 0, result.stderr)
    assert.ok(result.stdout.includes(`源目录: ${c.src}`))
    assert.ok(result.stdout.includes('新增 3 / 更新 0 / 未变 0 / 跳过 0'))
    assert.ok(result.stdout.includes(`[+] ${path.join('src', 'content', 'tracking', 'hotnews', '2026-10-20.md')}`))
    assert.ok(result.stdout.includes('完成。'))

    assert.equal(
      fs.readFileSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-20.md'), 'utf8'),
      EXPECTED_HOT
    )
    assert.equal(
      fs.readFileSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-19.md'), 'utf8'),
      `---
title: '昨日主线'
date: 2026-10-19
kind: hotnews
---

<details class="tracking-note">
<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>

> 调研日期：2026-10-19

</details>

昨日正文。
`
    )
    assert.equal(
      fs.readFileSync(path.join(c.repo, 'src/content/tracking/topics/2026-10-18-示例.md'), 'utf8'),
      `---
title: '示例专题'
date: 2026-10-18
kind: topic
---

<details class="tracking-note">
<summary>调研说明（时间窗、覆盖缺口与调研方式）</summary>

> 说明：fixture

</details>

## 第一节

专题正文，引用 [热点](/tracking/2026-10-20)。
`
    )
  } finally {
    c.cleanup()
  }
})

test('无参数全量 CLI 纳入发布线并保持旧类路径，重复运行无变化', async () => {
  const c = makeCase('release-cli')
  try {
    seedReleaseCase(c)
    fs.copyFileSync(path.join(HERE, '..', 'sync-tracking.mjs'), path.join(c.repo, 'scripts', 'sync-tracking.mjs'))
    const options = { cwd: c.repo, env: { ...process.env, TRACKING_SRC: c.src } }
    const args = [path.join(c.repo, 'scripts', 'sync-tracking.mjs')]
    const first = await runProcess(process.execPath, args, options)
    assert.equal(first.code, 0, first.stdout + first.stderr)
    assert.ok(first.stdout.includes('新增 5 / 更新 0 / 未变 0 / 跳过 0'), first.stdout)
    assert.ok(first.stdout.includes(`[+] ${RELEASE_DEST}`), first.stdout)
    assert.match(fs.readFileSync(path.join(c.repo, RELEASE_DEST), 'utf8'), /kind: release/)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-20.md')), true)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-20-2.md')), true)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics/2026-10-18-示例.md')), true)
    const second = await runProcess(process.execPath, args, options)
    assert.equal(second.code, 0, second.stdout + second.stderr)
    assert.ok(second.stdout.includes('新增 0 / 更新 0 / 未变 5 / 跳过 0'), second.stdout)
  } finally {
    c.cleanup()
  }
})

const WITH_COVERAGE = `# 热点追踪｜2026-10-21｜覆盖说明不进生成物

> 调研日期：2026-10-21

## 本期值得了解

### 1. 正文小标题

正文一段。

## 检索覆盖说明

- 增量基准：仅工作区可见
- HN 检出：仅工作区可见

### 7. 待核实线索

这条在覆盖说明之后，不应被误删。
`

const WITH_COVERAGE_MIDDLE = `# 热点追踪｜2026-10-22｜覆盖说明在中间

> 调研日期：2026-10-22

## 本期值得了解

正文一段。

## 检索覆盖说明

- 内部记录

## 其他值得关注

覆盖说明之后的板块保留。
`

test('检索覆盖说明整节不写入生成物，原稿不改', () => {
  const c = makeCase('coverage')
  try {
    writeSource(c.src, '2026-10-21-热点追踪.md', WITH_COVERAGE)
    writeSource(c.src, '2026-10-22-热点追踪.md', WITH_COVERAGE_MIDDLE)

    const plan = planTracking({
      repoRoot: c.repo,
      srcDir: c.src,
      files: ['2026-10-21-热点追踪.md', '2026-10-22-热点追踪.md']
    })
    assert.deepEqual(plan.errors, [])
    const [tail, middle] = plan.files
    assert.equal(tail.file, '2026-10-21-热点追踪.md')

    // 覆盖说明在末尾：整节删除，其后的三级标题不属于该节
    assert.ok(!tail.output.includes('检索覆盖说明'), tail.output)
    assert.ok(!tail.output.includes('仅工作区可见'), tail.output)
    assert.ok(tail.output.includes('### 7. 待核实线索'))
    assert.ok(tail.output.trimEnd().endsWith('这条在覆盖说明之后，不应被误删。'))

    // 覆盖说明在中间：只删该节，后面的二级标题与正文保留
    assert.ok(!middle.output.includes('检索覆盖说明'))
    assert.ok(!middle.output.includes('内部记录'))
    assert.ok(middle.output.includes('## 其他值得关注'))
    assert.ok(middle.output.includes('覆盖说明之后的板块保留。'))

    // 原稿不被修改
    assert.equal(fs.readFileSync(path.join(c.src, '2026-10-21-热点追踪.md'), 'utf8'), WITH_COVERAGE)
  } finally {
    c.cleanup()
  }
})
