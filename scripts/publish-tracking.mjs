#!/usr/bin/env node
/**
 * 前沿追踪 -> 博客发布编排器（薄封装，个人自用）
 *
 * 用法（仓库根）：
 *   bun scripts/publish-tracking.mjs plan    --file '<原始文件名>.md' [...]
 *   bun scripts/publish-tracking.mjs prepare --file '<原始文件名>.md' [--approve-topic] [...]
 *   bun scripts/publish-tracking.mjs publish --file '<原始文件名>.md' [--approve-topic] [...]
 *   bun scripts/publish-tracking.mjs verify  --sha <40位commit> --file '<原始文件名>.md' [...]
 *
 * 约束：
 *   - 只接受显式 --file；不存在「无参数全量发布」。
 *   - plan 只读；prepare 同步选定文件并真实 bun run build，不提交不推送；
 *     publish 额外要求 main、干净暂存区、除选定目标外无 WIP、本地与 origin/main 对齐，
 *     然后精确 add/commit 选定生成物、push、回读远端 SHA、等待该 SHA 的 deploy.yml run、
 *     最后比较线上正文。
 *   - 专题（kind=topic）在 prepare/publish 前必须显式 --approve-topic。
 *   - verify 只读、不重建：要求 HEAD==--sha、选定生成物与 HEAD 一致、本地 dist 页面存在
 *     （通常来自 publish/prepare 的构建），再回读远端 main、等待该 SHA 的 run、比较线上正文。
 *   - 不 stash/reset/merge/全仓 add/代提交；失败不回滚、不重提交。
 *
 * 环境变量：TRACKING_SRC 覆盖源目录；TRACKING_CI_TIMEOUT_MS / TRACKING_CI_POLL_MS
 * 覆盖 CI 有界等待（默认 600000 / 10000 毫秒）。
 *
 * 测试边界（run / now / sleep / log / repoRoot / srcDir 等）可通过 main 的 deps 注入。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_TRACKING_SRC,
  applyTrackingPlan,
  planTracking
} from './sync-tracking.mjs'

const SCRIPT_FILE = fileURLToPath(import.meta.url)
export const PUBLISH_REPO_ROOT = path.resolve(path.dirname(SCRIPT_FILE), '..')
export const SITE_ORIGIN = 'https://linkoulinkou.github.io'
export const GH_REPO = 'LINKOULINKOU/linkoulinkou.github.io'
export const DEPLOY_WORKFLOW = 'deploy.yml'

const USAGE = `用法：
  bun scripts/publish-tracking.mjs plan    --file '<原始文件名>.md' [...]
  bun scripts/publish-tracking.mjs prepare --file '<原始文件名>.md' [--approve-topic] [...]
  bun scripts/publish-tracking.mjs publish --file '<原始文件名>.md' [--approve-topic] [...]
  bun scripts/publish-tracking.mjs verify  --sha <40位commit> --file '<原始文件名>.md' [...]`

class UsageError extends Error {}

function fail(stage, message) {
  const error = new Error(message)
  error.stage = stage
  throw error
}

const posix = (p) => p.split(path.sep).join('/')
const splitZ = (out) => out.split('\0').filter(Boolean).map(posix)
const tail = (text, max = 1200) => {
  const s = String(text ?? '').trim()
  return s.length > max ? s.slice(-max) : s
}

/** 真实命令执行器；测试可注入同签名的 run。 */
export function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (error) => resolve({ code: 127, stdout, stderr: String(error) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
      const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
      return map[name.toLowerCase()] ?? whole
    })
}

function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
}

function htmlToText(html) {
  return decodeEntities(
    stripNonContent(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC')
}

/**
 * 从详情页提取正文容器 #content（真实页面见 src/pages/tracking/[...slug].astro
 * 渲染出的 <div id="content" class="... prose ...">），返回规范化全文文本。
 * 找不到容器返回 null，避免退化成标题/整页比较而误判通过。
 */
export function extractTrackingBodyText(html) {
  const source = stripNonContent(html)
  const open = /<div\b[^>]*\bid\s*=\s*["']content["'][^>]*>/i.exec(source)
  if (!open) return null
  const start = open.index + open[0].length
  const tagRe = /<div\b[^>]*>|<\/div\s*>/gi
  tagRe.lastIndex = start
  let depth = 1
  let match
  while ((match = tagRe.exec(source))) {
    if (match[0][1] === '/') depth -= 1
    else if (!/\/>\s*$/.test(match[0])) depth += 1
    if (depth === 0) {
      const text = htmlToText(source.slice(start, match.index))
      return text || null
    }
  }
  return null
}

function parseArgs(argv) {
  const command = argv[0]
  if (!['plan', 'prepare', 'publish', 'verify'].includes(command)) {
    throw new UsageError(command ? `未知子命令：${command}` : '缺少子命令')
  }
  const files = []
  let approveTopic = false
  let sha = null
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--file') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new UsageError('--file 缺少文件名')
      files.push(value)
      i += 1
    } else if (arg === '--approve-topic') {
      approveTopic = true
    } else if (arg === '--sha') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new UsageError('--sha 缺少提交 SHA')
      sha = value
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      throw new UsageError('')
    } else {
      throw new UsageError(`未知参数：${arg}`)
    }
  }
  if (files.length === 0) throw new UsageError('必须用 --file 指定至少一个源文件（拒绝全量发布）')
  if (command === 'verify') {
    if (!sha) throw new UsageError('verify 必须指定 --sha <40位commit>')
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new UsageError(`--sha 不是 40 位十六进制提交：${sha}`)
  }
  return { command, files, approveTopic, sha }
}

function buildContext(deps) {
  const env = deps.env ?? process.env
  const ciTimeout = Number(deps.ciTimeoutMs ?? env.TRACKING_CI_TIMEOUT_MS ?? 600000)
  const ciPoll = Number(deps.ciPollMs ?? env.TRACKING_CI_POLL_MS ?? 10000)
  return {
    repoRoot: path.resolve(deps.repoRoot ?? PUBLISH_REPO_ROOT),
    srcDir: path.resolve(deps.srcDir ?? env.TRACKING_SRC ?? DEFAULT_TRACKING_SRC),
    run: deps.run ?? runCommand,
    log: deps.log ?? ((line) => console.log(line)),
    now: deps.now ?? (() => Date.now()),
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    siteOrigin: String(deps.siteOrigin ?? SITE_ORIGIN).replace(/\/+$/, ''),
    ghRepo: deps.ghRepo ?? GH_REPO,
    workflow: deps.workflow ?? DEPLOY_WORKFLOW,
    ciTimeoutMs: Number.isFinite(ciTimeout) && ciTimeout > 0 ? ciTimeout : 600000,
    ciPollMs: Number.isFinite(ciPoll) && ciPoll > 0 ? ciPoll : 10000
  }
}

const gitArgs = (ctx, args) => ['-C', ctx.repoRoot, '-c', 'core.quotePath=false', ...args]

async function git(ctx, args) {
  return ctx.run('git', gitArgs(ctx, args), { cwd: ctx.repoRoot })
}

async function gitOut(ctx, args, stage) {
  const result = await git(ctx, args)
  if (result.code !== 0) {
    fail(stage, `git ${args.join(' ')} 失败（exit ${result.code}）：${tail(result.stderr || result.stdout)}`)
  }
  return result.stdout
}

async function changedPaths(ctx) {
  const staged = splitZ(await gitOut(ctx, ['diff', '--cached', '--name-only', '-z'], '读取暂存区'))
  const unstaged = splitZ(await gitOut(ctx, ['diff', '--name-only', '-z'], '读取工作区'))
  const untracked = splitZ(await gitOut(ctx, ['ls-files', '--others', '--exclude-standard', '-z'], '读取未跟踪文件'))
  return [...new Set([...staged, ...unstaged, ...untracked])]
}

function printPlan(ctx, plan, approveTopic) {
  ctx.log('追踪发布计划（只读）')
  ctx.log(`源目录: ${plan.srcDir}`)
  ctx.log(`仓库: ${ctx.repoRoot}`)
  const labels = { added: '[新增]', updated: '[更新]', unchanged: '[未变]' }
  for (const item of plan.files) {
    ctx.log(`${labels[item.status]} ${item.file} → ${item.destRel} (slug: ${item.slug})`)
  }
  if (plan.skipped.length) ctx.log(`[跳过] 命名不符：${plan.skipped.join('、')}`)
  if (plan.warnings.length) {
    ctx.log(`[警告] ${plan.warnings.length} 条:`)
    for (const warning of plan.warnings) ctx.log(`    ${warning}`)
  }
  if (plan.orphans.length) {
    ctx.log(`[孤儿] ${plan.orphans.length} 个（只报告，不删除）:`)
    for (const orphan of plan.orphans) ctx.log(`    ${orphan}`)
  }
  const topics = plan.files.filter((item) => item.kind === 'topic')
  for (const topic of topics) {
    ctx.log(
      approveTopic
        ? `[专题] ${topic.file} 已授权（--approve-topic）`
        : `[专题] ${topic.file} 待授权（prepare/publish 需 --approve-topic）`
    )
  }
  const state = plan.errors.length
    ? '计划被阻止：请先处理错误。'
    : plan.warnings.length
      ? '计划被阻止：请先处理警告。'
      : '计划可执行。'
  ctx.log(state)
}

function ensurePlanUsable(plan) {
  if (plan.errors.length) fail('计划', plan.errors.join('；'))
  if (plan.warnings.length) {
    fail('警告预检', `转换警告 ${plan.warnings.length} 条，已在写盘/构建前停止：\n${plan.warnings.join('\n')}`)
  }
}

function ensureTopicApproved(plan, approveTopic) {
  const topics = plan.files.filter((item) => item.kind === 'topic')
  if (!topics.length || approveTopic) return
  fail(
    '专题授权',
    `以下专题需显式 --approve-topic 才能 prepare/publish：${topics.map((item) => item.file).join('、')}`
  )
}

async function assertPublishReady(ctx, plan) {
  const branch = (await gitOut(ctx, ['rev-parse', '--abbrev-ref', 'HEAD'], '分支检查')).trim()
  if (branch !== 'main') fail('分支检查', `当前分支为 ${branch}，publish 只允许 main`)

  const staged = splitZ(await gitOut(ctx, ['diff', '--cached', '--name-only', '-z'], '暂存区检查'))
  if (staged.length) fail('暂存区检查', `暂存区不干净：${staged.join('、')}`)

  const allowed = new Set(plan.files.map((item) => posix(item.destRel)))
  const changed = await changedPaths(ctx)
  const outside = changed.filter((p) => !allowed.has(p))
  if (outside.length) {
    fail('工作区检查', `除选定目标外有未提交改动，已停止：${outside.join('、')}`)
  }

  const fetched = await git(ctx, ['fetch', 'origin', 'main'])
  if (fetched.code !== 0) {
    fail('远端对齐', `git fetch origin main 失败（exit ${fetched.code}）：${tail(fetched.stderr || fetched.stdout)}`)
  }
  const counts = (await gitOut(ctx, ['rev-list', '--left-right', '--count', 'origin/main...HEAD'], '远端对齐'))
    .trim()
    .split(/\s+/)
    .map(Number)
  const [behind, ahead] = counts
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    fail('远端对齐', `无法解析 origin/main 与 HEAD 的差距：${counts.join(' ')}`)
  }
  if (ahead > 0 || behind > 0) {
    fail('远端对齐', `本地与 origin/main 不对齐：ahead ${ahead}，behind ${behind}；不自动 push/merge/reset`)
  }
}

async function assertOnlySelected(ctx, plan) {
  const allowed = new Set(plan.files.map((item) => posix(item.destRel)))
  const outside = (await changedPaths(ctx)).filter((p) => !allowed.has(p))
  if (outside.length) {
    fail('工作区检查', `本次发布只允许选定生成物变化，发现其他改动：${outside.join('、')}`)
  }
}

async function runBuild(ctx) {
  ctx.log('[构建] bun run build ...')
  const result = await ctx.run('bun', ['run', 'build'], { cwd: ctx.repoRoot })
  if (result.code !== 0) {
    fail('本地构建', `bun run build 失败（exit ${result.code}）：${tail(result.stderr || result.stdout)}`)
  }
  ctx.log('本地构建: 通过')
}

function applySelected(plan) {
  try {
    return applyTrackingPlan(plan)
  } catch (error) {
    fail('同步', `写生成物失败：${error.message}`)
  }
}

async function commitSelected(ctx, plan, changed) {
  const paths = [...new Set(changed.map(posix))].sort()
  const add = await git(ctx, ['add', '--', ...paths])
  if (add.code !== 0) fail('暂存', `git add 失败（exit ${add.code}）：${tail(add.stderr || add.stdout)}`)

  const staged = splitZ(await gitOut(ctx, ['diff', '--cached', '--name-only', '-z'], '暂存检查')).sort()
  if (JSON.stringify(staged) !== JSON.stringify(paths)) {
    fail('暂存检查', `暂存内容不是本次选定文件：期望 ${paths.join('、')}，实际 ${staged.join('、') || '空'}`)
  }

  const changedSet = new Set(paths)
  const slugs = plan.files.filter((item) => changedSet.has(posix(item.destRel))).map((item) => item.slug)
  const message = `tracking: 发布 ${slugs.join('、')}`
  const committed = await git(ctx, ['commit', '-m', message])
  if (committed.code !== 0) {
    fail('提交', `git commit 失败（exit ${committed.code}）：${tail(committed.stderr || committed.stdout)}`)
  }
  const sha = (await gitOut(ctx, ['rev-parse', 'HEAD'], '提交')).trim()

  const committedPaths = splitZ(
    await gitOut(ctx, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'], '提交校验')
  ).sort()
  if (JSON.stringify(committedPaths) !== JSON.stringify(paths)) {
    fail('提交校验', `commit ${sha} 包含的文件不是本次选定文件：${committedPaths.join('、')}`)
  }
  ctx.log(`已提交 ${sha}：${paths.join('、')}`)
  return sha
}

async function readRemoteMain(ctx, stage = '远端回读') {
  const out = await gitOut(ctx, ['ls-remote', 'origin', 'refs/heads/main'], stage)
  const sha = out.trim().split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) fail(stage, `无法解析远端 main SHA：${out.trim()}`)
  return sha
}

async function pushAndReadback(ctx, sha) {
  const pushed = await git(ctx, ['push', 'origin', 'main'])
  if (pushed.code !== 0) {
    fail(
      'push',
      `git push 失败（exit ${pushed.code}，本地 commit ${sha} 保留，未回滚、未重提交）：${tail(pushed.stderr || pushed.stdout)}`
    )
  }
  let remote = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    remote = await readRemoteMain(ctx)
    if (remote === sha) break
    await ctx.sleep(1000)
  }
  if (remote !== sha) {
    fail('远端回读', `push 后远端 main 为 ${remote ?? '未知'}，本地 commit 为 ${sha}`)
  }
  ctx.log(`远端 main 回读: ${sha}`)
}

function parseJson(text, stage) {
  try {
    return JSON.parse(text)
  } catch {
    fail(stage, `无法解析 JSON：${tail(text, 400)}`)
  }
}

async function waitForDeploy(ctx, sha) {
  const deadline = ctx.now() + ctx.ciTimeoutMs
  let found = null
  let lastStatus = '未找到 run'
  while (!found) {
    const listed = await ctx.run(
      'gh',
      [
        'run',
        'list',
        '--commit',
        sha,
        '--workflow',
        ctx.workflow,
        '--branch',
        'main',
        '--repo',
        ctx.ghRepo,
        '--limit',
        '1',
        '--json',
        'databaseId,headSha,status,conclusion'
      ],
      { cwd: ctx.repoRoot }
    )
    if (listed.code !== 0) {
      fail('CI 查询', `gh run list 失败（exit ${listed.code}，commit ${sha}）：${tail(listed.stderr || listed.stdout)}`)
    }
    const runs = parseJson(listed.stdout || '[]', 'CI 查询')
    if (Array.isArray(runs) && runs.length) {
      found = runs[0]
      if (found.headSha !== sha) {
        fail('CI 查询', `gh 返回的 run headSha 为 ${found.headSha}，不是本次 ${sha}`)
      }
      break
    }
    if (ctx.now() >= deadline) {
      fail('CI 等待', `等待部署运行超时（commit ${sha}，${ctx.ciTimeoutMs}ms 内未发现 run）`)
    }
    await ctx.sleep(ctx.ciPollMs)
  }

  let detail = null
  while (true) {
    const viewed = await ctx.run(
      'gh',
      [
        'run',
        'view',
        String(found.databaseId),
        '--repo',
        ctx.ghRepo,
        '--json',
        'databaseId,headSha,status,conclusion,jobs'
      ],
      { cwd: ctx.repoRoot }
    )
    if (viewed.code !== 0) {
      fail('CI 查询', `gh run view 失败（exit ${viewed.code}，run ${found.databaseId}，commit ${sha}）：${tail(viewed.stderr || viewed.stdout)}`)
    }
    detail = parseJson(viewed.stdout, 'CI 查询')
    if (detail.headSha !== sha) {
      fail('CI 校验', `run ${found.databaseId} 的 headSha 为 ${detail.headSha}，不是本次 ${sha}`)
    }
    lastStatus = `${detail.status}/${detail.conclusion ?? 'pending'}`
    if (detail.status === 'completed') break
    if (ctx.now() >= deadline) {
      fail('CI 等待', `等待部署超时（run ${found.databaseId}，commit ${sha}，最后状态 ${lastStatus}）`)
    }
    await ctx.sleep(ctx.ciPollMs)
  }

  if (detail.conclusion !== 'success') {
    fail(
      'CI 部署',
      `CI 未成功（run ${found.databaseId}，commit ${sha}，status ${detail.status}，conclusion ${detail.conclusion}）`
    )
  }
  const jobs = Array.isArray(detail.jobs) ? detail.jobs : []
  for (const name of ['build', 'deploy']) {
    const job = jobs.find((item) => item.name === name)
    if (!job) fail('CI 校验', `run ${found.databaseId} 缺少 ${name} job（commit ${sha}）`)
    if (job.conclusion !== 'success') {
      fail('CI 部署', `run ${found.databaseId} 的 ${name} job 结论为 ${job.conclusion}（commit ${sha}）`)
    }
  }
  return detail
}

async function verifyOnline(ctx, items, context = {}) {
  const where = context.sha
    ? `（commit ${context.sha}${context.runId ? `，run ${context.runId}` : ''}）`
    : ''
  let index = 0
  for (const item of items) {
    const localPath = path.join(ctx.repoRoot, 'dist/tracking', item.slug, 'index.html')
    if (!fs.existsSync(localPath)) {
      fail('线上核验', `本地 dist 缺少页面 ${path.relative(ctx.repoRoot, localPath)}，无法比较正文${where}`)
    }
    const localText = extractTrackingBodyText(fs.readFileSync(localPath, 'utf8'))
    if (!localText) {
      fail('线上核验', `本地 dist 页面未找到正文容器 #content：${item.slug}${where}`)
    }

    const url = `${ctx.siteOrigin}/tracking/${encodeURIComponent(item.slug)}?nc=${ctx.now()}-${index}`
    index += 1
    const fetched = await ctx.run('curl', ['-fLsS', url], { cwd: ctx.repoRoot })
    if (fetched.code !== 0) {
      fail(
        '线上核验',
        `curl -fLsS 失败（exit ${fetched.code}）：${url}\n${tail(fetched.stderr || fetched.stdout)}${where}`
      )
    }
    const remoteText = extractTrackingBodyText(fetched.stdout)
    if (!remoteText) {
      fail('线上核验', `线上页面未找到正文容器 #content：${url}${where}`)
    }
    if (remoteText !== localText) {
      let at = 0
      while (at < localText.length && at < remoteText.length && localText[at] === remoteText[at]) at += 1
      const nearby = remoteText.slice(Math.max(0, at - 40), at + 80)
      fail(
        '线上正文',
        `线上正文与本地构建不一致：/tracking/${item.slug}（本地 ${localText.length} 字，线上 ${remoteText.length} 字；差异附近：${nearby}）${where}`
      )
    }
    ctx.log(`线上正文一致: /tracking/${item.slug}`)
  }
}

async function cmdPlan(ctx, args) {
  const plan = planTracking({ repoRoot: ctx.repoRoot, srcDir: ctx.srcDir, files: args.files })
  printPlan(ctx, plan, args.approveTopic)
  return plan.errors.length || plan.warnings.length ? 1 : 0
}

async function cmdPrepare(ctx, args) {
  const plan = planTracking({ repoRoot: ctx.repoRoot, srcDir: ctx.srcDir, files: args.files })
  printPlan(ctx, plan, args.approveTopic)
  ensurePlanUsable(plan)
  ensureTopicApproved(plan, args.approveTopic)

  const applied = applySelected(plan)
  ctx.log(`[同步] 写入 ${applied.written.length} 个生成物，未变 ${applied.unchanged.length} 个`)
  await runBuild(ctx)
  ctx.log('prepare 完成：未提交、未推送。')
  return 0
}

async function cmdPublish(ctx, args) {
  const plan = planTracking({ repoRoot: ctx.repoRoot, srcDir: ctx.srcDir, files: args.files })
  printPlan(ctx, plan, args.approveTopic)
  ensurePlanUsable(plan)
  ensureTopicApproved(plan, args.approveTopic)
  await assertPublishReady(ctx, plan)

  const applied = applySelected(plan)
  ctx.log(`[同步] 写入 ${applied.written.length} 个生成物，未变 ${applied.unchanged.length} 个`)
  await assertOnlySelected(ctx, plan)

  if ((await changedPaths(ctx)).length === 0) {
    ctx.log('无变化：未构建、未提交、未推送。')
    return 0
  }

  await runBuild(ctx)
  await assertOnlySelected(ctx, plan)
  const changed = await changedPaths(ctx)
  if (changed.length === 0) {
    ctx.log('构建后无变化：未提交、未推送。')
    return 0
  }
  const sha = await commitSelected(ctx, plan, changed)
  await pushAndReadback(ctx, sha)
  const run = await waitForDeploy(ctx, sha)
  ctx.log(`远端部署: 成功（run ${run.databaseId}）`)
  await verifyOnline(ctx, plan.files, { sha, runId: run.databaseId })
  ctx.log('发布结果：')
  ctx.log('  本地构建: 通过')
  ctx.log(`  远端部署: 成功（run ${run.databaseId}）`)
  ctx.log(`  线上正文: 一致（${plan.files.length} 篇）`)
  return 0
}

async function cmdVerify(ctx, args) {
  const sha = args.sha.toLowerCase()
  const plan = planTracking({ repoRoot: ctx.repoRoot, srcDir: ctx.srcDir, files: args.files })
  if (plan.errors.length) fail('计划', plan.errors.join('；'))

  const head = (await gitOut(ctx, ['rev-parse', 'HEAD'], '本地提交')).trim().toLowerCase()
  if (head !== sha) {
    fail('本地提交', `当前 HEAD 为 ${head}，不是 --sha ${sha}；verify 只读，不切换工作区`)
  }
  const paths = plan.files.map((item) => posix(item.destRel))
  const dirty = [
    ...splitZ(await gitOut(ctx, ['diff', '--name-only', '-z', 'HEAD', '--', ...paths], '本地文件')),
    ...splitZ(await gitOut(ctx, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths], '本地文件'))
  ]
  if (dirty.length) {
    fail('本地文件', `工作区生成物与 ${sha} 不一致，dist 可能不代表该提交：${dirty.join('、')}`)
  }
  for (const item of plan.files) {
    const localPath = path.join(ctx.repoRoot, 'dist/tracking', item.slug, 'index.html')
    if (!fs.existsSync(localPath)) fail('本地文件', `缺少本地 dist 页面：${path.relative(ctx.repoRoot, localPath)}`)
  }

  const remote = await readRemoteMain(ctx)
  if (remote !== sha) {
    fail('远端回读', `远端 main 为 ${remote}，不是 --sha ${sha}；该提交可能未部署`)
  }
  const run = await waitForDeploy(ctx, sha)
  ctx.log(`远端部署: 成功（run ${run.databaseId}）`)
  await verifyOnline(ctx, plan.files, { sha, runId: run.databaseId })
  ctx.log('复验结果（只读）：')
  ctx.log(`  远端部署: 成功（run ${run.databaseId}）`)
  ctx.log(`  线上正文: 一致（${plan.files.length} 篇）`)
  return 0
}

/** 可测试入口：返回退出码，不直接 process.exit。 */
export async function main(argv, deps = {}) {
  const ctx = buildContext(deps)
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      ctx.log(USAGE)
      return 0
    }
    const args = parseArgs(argv)
    if (args.command === 'plan') return await cmdPlan(ctx, args)
    if (args.command === 'prepare') return await cmdPrepare(ctx, args)
    if (args.command === 'publish') return await cmdPublish(ctx, args)
    return await cmdVerify(ctx, args)
  } catch (error) {
    if (error instanceof UsageError) {
      if (error.message) ctx.log(`参数错误：${error.message}`)
      ctx.log(USAGE)
      return 2
    }
    ctx.log(`[失败] 阶段：${error.stage ?? '未分类'}`)
    ctx.log(`  ${error.message}`)
    return 1
  }
}

function invokedDirectly() {
  if (!process.argv[1]) return false
  const invoked = path.resolve(process.argv[1])
  const self = path.resolve(SCRIPT_FILE)
  return process.platform === 'win32' ? invoked.toLowerCase() === self.toLowerCase() : invoked === self
}

if (invokedDirectly()) {
  const code = await main(process.argv.slice(2))
  process.exitCode = code
}
