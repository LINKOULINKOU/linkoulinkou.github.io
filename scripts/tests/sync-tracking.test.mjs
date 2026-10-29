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
  assert.equal(classifyTrackingFile('2026-10-18-随便.md'), null)
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
