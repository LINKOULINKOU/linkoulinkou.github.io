// 集成测试：真实临时源目录 + 临时 git repo + 本地 bare remote。
// build / gh / curl 边界由 runner 注入，均为本地 fixture，不代表真实 GitHub Actions 或 Pages。
import { test } from 'bun:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { main, extractTrackingBodyText } from '../publish-tracking.mjs'
import { planTracking } from '../sync-tracking.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TMP_ROOT = path.join(HERE, '.tmp')
const GH_REPO = 'LINKOULINKOU/linkoulinkou.github.io'
const SITE = 'https://linkoulinkou.github.io'

function realRun(command, args, options = {}) {
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

async function git(c, args) {
  const result = await realRun('git', ['-C', c.repo, '-c', 'core.quotePath=false', ...args])
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} 失败\n${result.stdout}\n${result.stderr}`)
  return result.stdout.replace(/\r\n/g, '\n').trim()
}

function write(c, relative, content) {
  const file = path.join(c.repo, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

function sourceHot(date, title = '新热点', body = '第一段新正文。\n\n第二段完整正文，用于比较。') {
  return `# 热点追踪｜${date}｜${title}\n\n> 调研日期：${date}\n> 调研方式：fixture\n\n${body}\n`
}

function sourceTopic(date, name = '中文专题', body = '第一段新正文。\n\n第二段完整正文，用于比较。') {
  return `# 专题调研｜${name}\n\n> 调研日期：${date}\n> 调研方式：fixture\n\n${body}\n`
}

function pageHtml(title, paragraphs) {
  const ps = paragraphs.map((p) => `<p>${p}</p>`).join('')
  return `<!doctype html><html><head><title>${title}</title></head><body>
<main><article data-pagefind-body><div id="content-header"><h1>${title}</h1><span>专题调研</span></div>
<div id="content" class="prose"><details class="tracking-note"><summary>调研说明</summary><blockquote>fixture</blockquote></details>${ps}</div>
</article></main><footer>footer</footer></body></html>`
}

async function setup(name, { initialTracking = true } = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  const root = fs.mkdtempSync(path.join(TMP_ROOT, `${name}-`))
  const c = {
    root,
    repo: path.join(root, 'repo'),
    remote: path.join(root, 'remote.git'),
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
  fs.mkdirSync(c.repo, { recursive: true })
  fs.mkdirSync(c.src, { recursive: true })
  write(c, '.gitignore', 'dist/\n.astro/\nnode_modules/\n')
  write(c, 'README.md', '# fixture repo\n')
  if (initialTracking) {
    write(
      c,
      'src/content/tracking/hotnews/2026-10-01.md',
      `---\ntitle: '旧归档'\ndate: 2026-10-01\nkind: hotnews\n---\n\n旧归档正文。\n`
    )
  }
  await git(c, ['init', '-b', 'main'])
  await git(c, ['config', 'user.email', 'fixture@example.test'])
  await git(c, ['config', 'user.name', 'fixture'])
  await git(c, ['config', 'commit.gpgsign', 'false'])
  await git(c, ['config', 'core.autocrlf', 'false'])
  await git(c, ['add', '-A'])
  await git(c, ['commit', '-m', 'initial'])
  await realRun('git', ['init', '--bare', c.remote])
  await git(c, ['remote', 'add', 'origin', c.remote])
  await git(c, ['push', '-u', 'origin', 'main'])
  return c
}

function makeHarness(c, options = {}) {
  const state = {
    buildCalls: 0,
    buildCode: options.buildCode ?? 0,
    pages: options.pages ?? [],
    localHtml: new Map(),
    remoteHtml: options.remoteHtml ?? null,
    curlCode: options.curlCode ?? 0,
    logs: [],
    ghCalls: [],
    curlUrls: [],
    curlCalls: [],
    ghList: options.ghList,
    ghView: options.ghView,
    ghConclusion: options.ghConclusion ?? 'success',
    lastSha: null,
    gitCalls: []
  }
  const run = async (command, args, opts = {}) => {
    if (command === 'bun' && args[0] === 'run' && args[1] === 'build') {
      state.buildCalls += 1
      if (state.buildCode !== 0) {
        return { code: state.buildCode, stdout: '', stderr: 'fixture build failed' }
      }
      for (const page of state.pages) {
        const html = pageHtml(page.title, page.paragraphs)
        state.localHtml.set(page.slug, html)
        const dir = path.join(opts.cwd, 'dist', 'tracking', page.slug)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8')
      }
      return { code: 0, stdout: 'fixture build ok', stderr: '' }
    }
    if (command === 'gh') {
      state.ghCalls.push(args)
      if (args[0] === 'run' && args[1] === 'list') {
        const i = args.indexOf('--commit')
        const sha = i >= 0 ? args[i + 1] : null
        state.lastSha = sha
        const runs = state.ghList ? state.ghList(sha) : [
          { databaseId: 42, headSha: sha, status: 'completed', conclusion: state.ghConclusion }
        ]
        return { code: 0, stdout: JSON.stringify(runs), stderr: '' }
      }
      if (args[0] === 'run' && args[1] === 'view') {
        const view = state.ghView
          ? state.ghView(args[2], state.lastSha)
          : {
              databaseId: 42,
              headSha: state.lastSha,
              status: 'completed',
              conclusion: state.ghConclusion,
              jobs: [
                { name: 'build', conclusion: state.ghConclusion === 'cancelled' ? 'cancelled' : 'success' },
                { name: 'deploy', conclusion: state.ghConclusion }
              ]
            }
        return { code: 0, stdout: JSON.stringify(view), stderr: '' }
      }
      return { code: 1, stdout: '', stderr: `unexpected gh ${args.join(' ')}` }
    }
    if (command === 'curl') {
      const url = args[args.length - 1]
      state.curlCalls.push(args)
      state.curlUrls.push(url)
      const slug = decodeURIComponent(new URL(url).pathname.split('/').pop())
      const html = state.remoteHtml
        ? state.remoteHtml.get(slug)
        : state.localHtml.get(slug)
      return {
        code: state.curlCode,
        stdout: html ?? '',
        stderr: state.curlCode ? 'curl: (22) 404' : ''
      }
    }
    state.gitCalls.push([command, ...args])
    return realRun(command, args, opts)
  }
  const deps = {
    repoRoot: c.repo,
    srcDir: c.src,
    siteOrigin: SITE,
    ghRepo: GH_REPO,
    run,
    log: (line) => state.logs.push(String(line)),
    now: options.now,
    sleep: options.sleep,
    ciTimeoutMs: options.ciTimeoutMs,
    ciPollMs: options.ciPollMs
  }
  return { state, deps }
}

async function localHead(c) {
  return git(c, ['rev-parse', 'HEAD'])
}

async function remoteHead(c) {
  const out = await git(c, ['ls-remote', 'origin', 'refs/heads/main'])
  return out.split(/\s+/)[0]
}

async function commitFiles(c) {
  const out = await git(c, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'])
  return out.split('\0').filter(Boolean).map((p) => p.replace(/\\/g, '/'))
}

function logs(h) {
  return h.state.logs.join('\n')
}

test('plan 只读：不写生成物、不构建、专题标待授权', async () => {
  const c = await setup('plan')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-专题-中文标题.md'), sourceTopic('2026-10-30'), 'utf8')
    const h = makeHarness(c)
    const code = await main(['plan', '--file', '2026-10-30-专题-中文标题.md'], h.deps)
    assert.equal(code, 0, logs(h))
    assert.match(logs(h), /待授权/)
    assert.match(logs(h), /--approve-topic/)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(await localHead(c), await remoteHead(c))
    assert.equal((await git(c, ['status', '--porcelain'])), '')
  } finally {
    c.cleanup()
  }
})

test('无 --file 时拒绝执行，不隐式全量发布', async () => {
  const c = await setup('no-file')
  try {
    const h = makeHarness(c)
    const code = await main(['publish'], h.deps)
    assert.equal(code, 2, logs(h))
    assert.match(logs(h), /--file/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)
  } finally {
    c.cleanup()
  }
})

test('publish 只允许 main 分支', async () => {
  const c = await setup('branch')
  try {
    await git(c, ['checkout', '-b', 'feature'])
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const before = await localHead(c)
    const h = makeHarness(c)
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /main/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(await localHead(c), before)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('prepare 只同步选定热点，不碰旁边未授权专题，也不要求全仓干净', async () => {
  const c = await setup('scope')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    fs.writeFileSync(path.join(c.src, '2026-10-30-专题-旁边专题.md'), sourceTopic('2026-10-30', '旁边专题'), 'utf8')
    write(c, 'wip.txt', 'other session work\n')
    const h = makeHarness(c, {
      pages: [{ slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }]
    })
    const code = await main(['prepare', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 0, logs(h))
    assert.equal(
      fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')),
      true
    )
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)
    assert.equal(h.state.buildCalls, 1)
    assert.match(logs(h), /本地构建:\s*通过/)
    assert.equal(await localHead(c), await remoteHead(c))
  } finally {
    c.cleanup()
  }
})

test('警告在写盘和构建之前停止', async () => {
  const c = await setup('warning')
  try {
    fs.writeFileSync(
      path.join(c.src, '2026-10-30-热点追踪.md'),
      sourceHot('2026-10-30').replace('热点追踪｜2026-10-30｜', '热点追踪｜2026-10-29｜'),
      'utf8'
    )
    const h = makeHarness(c)
    const code = await main(['prepare', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /警告/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('专题未授权时 prepare 拒绝，显式 --approve-topic 后通过', async () => {
  const c = await setup('gate')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-专题-中文标题.md'), sourceTopic('2026-10-30'), 'utf8')
    const first = makeHarness(c)
    const blocked = await main(['prepare', '--file', '2026-10-30-专题-中文标题.md'], first.deps)
    assert.equal(blocked, 1, logs(first))
    assert.match(logs(first), /approve-topic|待授权/)
    assert.equal(first.state.buildCalls, 0)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/topics')), false)

    const second = makeHarness(c, {
      pages: [
        {
          slug: '2026-10-30-中文标题',
          title: '中文标题',
          paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。']
        }
      ]
    })
    const allowed = await main(
      ['prepare', '--file', '2026-10-30-专题-中文标题.md', '--approve-topic'],
      second.deps
    )
    assert.equal(allowed, 0, logs(second))
    assert.equal(
      fs.existsSync(path.join(c.repo, 'src/content/tracking/topics/2026-10-30-中文标题.md')),
      true
    )
    assert.equal(second.state.buildCalls, 1)
  } finally {
    c.cleanup()
  }
})

test('build 失败不 commit、不 push', async () => {
  const c = await setup('build-fail')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const beforeHead = await localHead(c)
    const beforeRemote = await remoteHead(c)
    const h = makeHarness(c, { buildCode: 1 })
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /构建|build/)
    assert.equal(await localHead(c), beforeHead)
    assert.equal(await remoteHead(c), beforeRemote)
    assert.equal(h.state.ghCalls.length, 0)
    assert.equal(h.state.curlUrls.length, 0)
  } finally {
    c.cleanup()
  }
})

test('暂存区不干净时 publish 在同步前停止', async () => {
  const c = await setup('staged')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    write(c, 'staged.txt', 'staged\n')
    await git(c, ['add', 'staged.txt'])
    const before = await localHead(c)
    const h = makeHarness(c)
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /暂存区/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(await localHead(c), before)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('除选定目标外有未提交改动时 publish 停止', async () => {
  const c = await setup('wip')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    write(c, 'notes.txt', 'other session work\n')
    const before = await localHead(c)
    const h = makeHarness(c)
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /未提交|工作区/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(await localHead(c), before)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('本地 ahead 提交不会被顺手 push', async () => {
  const c = await setup('ahead')
  try {
    write(c, 'local.txt', 'local only\n')
    await git(c, ['add', 'local.txt'])
    await git(c, ['commit', '-m', 'local ahead'])
    const ahead = await localHead(c)
    const remoteBefore = await remoteHead(c)
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const h = makeHarness(c)
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /ahead|领先|超前/)
    assert.equal(await remoteHead(c), remoteBefore)
    assert.equal(await localHead(c), ahead)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('本地 behind 远端时 publish 停止', async () => {
  const c = await setup('behind')
  try {
    const other = path.join(c.root, 'other')
    const clone = await realRun('git', ['clone', '-b', 'main', c.remote, other])
    assert.equal(clone.code, 0, clone.stderr)
    await realRun('git', ['-C', other, 'config', 'user.email', 'other@example.test'])
    await realRun('git', ['-C', other, 'config', 'user.name', 'other'])
    await realRun('git', ['-C', other, 'config', 'commit.gpgsign', 'false'])
    fs.writeFileSync(path.join(other, 'remote.txt'), 'remote commit\n')
    await realRun('git', ['-C', other, 'add', 'remote.txt'])
    await realRun('git', ['-C', other, 'commit', '-m', 'remote ahead'])
    const pushed = await realRun('git', ['-C', other, 'push', 'origin', 'main'])
    assert.equal(pushed.code, 0, pushed.stderr)
    const remoteAfter = (await realRun('git', ['-C', other, 'rev-parse', 'HEAD'])).stdout.trim()

    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const h = makeHarness(c)
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /behind|落后|滞后/)
    assert.equal(await remoteHead(c), remoteAfter)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(fs.existsSync(path.join(c.repo, 'src/content/tracking/hotnews/2026-10-30.md')), false)
  } finally {
    c.cleanup()
  }
})

test('完整发布：精确 commit、readback 远端、SHA 过滤 CI、中文 slug 与正文一致', async () => {
  const c = await setup('success')
  try {
    const file = '2026-10-30-专题-中文标题.md'
    fs.writeFileSync(path.join(c.src, file), sourceTopic('2026-10-30'), 'utf8')
    const h = makeHarness(c, {
      pages: [
        {
          slug: '2026-10-30-中文标题',
          title: '中文标题',
          paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。']
        }
      ]
    })
    const code = await main(['publish', '--file', file, '--approve-topic'], h.deps)
    assert.equal(code, 0, logs(h))
    const sha = await localHead(c)
    assert.equal(await remoteHead(c), sha)
    assert.deepEqual(await commitFiles(c), ['src/content/tracking/topics/2026-10-30-中文标题.md'])
    assert.match(logs(h), /本地构建:\s*通过/)
    assert.match(logs(h), /远端部署:\s*成功/)
    assert.match(logs(h), /线上正文:\s*一致/)

    const list = h.state.ghCalls.find((a) => a[0] === 'run' && a[1] === 'list')
    assert.ok(list, '应调用 gh run list')
    assert.equal(list[list.indexOf('--commit') + 1], sha)
    assert.equal(list[list.indexOf('--workflow') + 1], 'deploy.yml')
    assert.equal(list[list.indexOf('--branch') + 1], 'main')
    assert.equal(list[list.indexOf('--repo') + 1], GH_REPO)
    const view = h.state.ghCalls.find((a) => a[0] === 'run' && a[1] === 'view')
    assert.ok(view, '应调用 gh run view')
    assert.equal(view[2], '42')
    assert.ok(view.join(' ').includes('jobs'))
    assert.equal(h.state.curlCalls.length, 1)
    assert.deepEqual(h.state.curlCalls[0].slice(0, 1), ['-fLsS'])
    assert.equal(h.state.curlUrls.length, 1)
    assert.ok(h.state.curlUrls[0].startsWith(`${SITE}/tracking/${encodeURIComponent('2026-10-30-中文标题')}?`), h.state.curlUrls[0])
    assert.match(h.state.curlUrls[0], /[?&]nc=/)
    assert.equal((await git(c, ['status', '--porcelain'])), '')
  } finally {
    c.cleanup()
  }
})

test('幂等：内容未变时 publish 不构建、不空提交、不推送', async () => {
  const c = await setup('idempotent')
  try {
    const file = '2026-10-30-热点追踪.md'
    fs.writeFileSync(path.join(c.src, file), sourceHot('2026-10-30'), 'utf8')
    const page = { slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }
    const first = makeHarness(c, { pages: [page] })
    assert.equal(await main(['publish', '--file', file], first.deps), 0, logs(first))
    const sha = await localHead(c)

    const second = makeHarness(c, { pages: [page] })
    const code = await main(['publish', '--file', file], second.deps)
    assert.equal(code, 0, logs(second))
    assert.match(logs(second), /无变化|未提交|未推送/)
    assert.equal(await localHead(c), sha)
    assert.equal(await remoteHead(c), sha)
    assert.equal(second.state.buildCalls, 0)
    assert.equal(second.state.ghCalls.length, 0)
    assert.equal(second.state.curlUrls.length, 0)
  } finally {
    c.cleanup()
  }
})

test('多文件中已未变的一项不进 commit，只有变化项被提交', async () => {
  const c = await setup('multi-file')
  try {
    const oldFile = '2026-10-29-热点追踪.md'
    const newFile = '2026-10-30-热点追踪.md'
    fs.writeFileSync(path.join(c.src, oldFile), sourceHot('2026-10-29', '旧热点'), 'utf8')
    const oldPlan = planTracking({ repoRoot: c.repo, srcDir: c.src, files: [oldFile] })
    assert.deepEqual(oldPlan.errors, [])
    assert.deepEqual([...oldPlan.warnings], [])
    fs.mkdirSync(path.dirname(oldPlan.files[0].destFile), { recursive: true })
    fs.writeFileSync(oldPlan.files[0].destFile, oldPlan.files[0].output, 'utf8')
    await git(c, ['add', '--', 'src/content/tracking/hotnews/2026-10-29.md'])
    await git(c, ['commit', '-m', 'prior tracking'])
    await git(c, ['push', 'origin', 'main'])

    fs.writeFileSync(path.join(c.src, newFile), sourceHot('2026-10-30', '新热点'), 'utf8')
    const h = makeHarness(c, {
      pages: [
        { slug: '2026-10-29', title: '旧热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] },
        { slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }
      ]
    })
    const code = await main(['publish', '--file', oldFile, '--file', newFile], h.deps)
    assert.equal(code, 0, logs(h))
    assert.deepEqual(await commitFiles(c), ['src/content/tracking/hotnews/2026-10-30.md'])
  } finally {
    c.cleanup()
  }
})

test('CI 失败：保留已推送 commit 并报告 run id', async () => {
  const c = await setup('ci-fail')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const h = makeHarness(c, {
      ghConclusion: 'failure',
      pages: [{ slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }]
    })
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    const sha = await localHead(c)
    assert.match(logs(h), /42/)
    assert.ok(logs(h).includes(sha), logs(h))
    assert.match(logs(h), /失败|failure/)
    assert.equal(await remoteHead(c), sha)
    assert.equal(h.state.curlUrls.length, 0)
  } finally {
    c.cleanup()
  }
})

test('CI cancelled 不是成功', async () => {
  const c = await setup('ci-cancel')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    const h = makeHarness(c, {
      ghConclusion: 'cancelled',
      pages: [{ slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }]
    })
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /cancelled|取消/)
    assert.equal(h.state.curlUrls.length, 0)
  } finally {
    c.cleanup()
  }
})

test('CI 等待有界超时，不把未完成当成功', async () => {
  const c = await setup('ci-timeout')
  try {
    fs.writeFileSync(path.join(c.src, '2026-10-30-热点追踪.md'), sourceHot('2026-10-30'), 'utf8')
    let clock = 0
    const h = makeHarness(c, {
      ghList: () => [],
      now: () => {
        clock += 20
        return clock
      },
      sleep: async () => {},
      ciTimeoutMs: 50,
      ciPollMs: 10,
      pages: [{ slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }]
    })
    const code = await main(['publish', '--file', '2026-10-30-热点追踪.md'], h.deps)
    assert.equal(code, 1, logs(h))
    const sha = await localHead(c)
    assert.match(logs(h), /超时/)
    assert.ok(logs(h).includes(sha), logs(h))
    assert.equal(h.state.curlUrls.length, 0)
  } finally {
    c.cleanup()
  }
})

test('HTTP 200 但线上仍是同标题旧正文时不通过', async () => {
  const c = await setup('old-body')
  try {
    const file = '2026-10-30-热点追踪.md'
    fs.writeFileSync(path.join(c.src, file), sourceHot('2026-10-30'), 'utf8')
    const old = new Map([
      ['2026-10-30', pageHtml('新热点', ['第一段相同。', '第二段旧正文，不应通过。'])]
    ])
    const h = makeHarness(c, {
      remoteHtml: old,
      curlCode: 0,
      pages: [{ slug: '2026-10-30', title: '新热点', paragraphs: ['第一段相同。', '第二段新正文，用于比较。'] }]
    })
    const code = await main(['publish', '--file', file], h.deps)
    assert.equal(code, 1, logs(h))
    assert.match(logs(h), /线上正文/)
    assert.match(logs(h), /不一致|不同/)
    assert.doesNotMatch(logs(h), /线上正文:\s*一致/)
    const sha = await localHead(c)
    assert.ok(logs(h).includes(sha), logs(h))
    assert.match(logs(h), /run 42/)
  } finally {
    c.cleanup()
  }
})

test('verify --sha 只读复验部署与线上正文，不重复构建或提交', async () => {
  const c = await setup('verify')
  try {
    const file = '2026-10-30-热点追踪.md'
    fs.writeFileSync(path.join(c.src, file), sourceHot('2026-10-30'), 'utf8')
    const page = { slug: '2026-10-30', title: '新热点', paragraphs: ['第一段新正文。', '第二段完整正文，用于比较。'] }
    const first = makeHarness(c, { pages: [page] })
    assert.equal(await main(['publish', '--file', file], first.deps), 0, logs(first))
    const sha = await localHead(c)
    const remote = await remoteHead(c)
    const distPath = path.join(c.repo, 'dist/tracking/2026-10-30/index.html')
    const localText = extractTrackingBodyText(fs.readFileSync(distPath, 'utf8'))
    assert.ok(localText.includes('第一段新正文。'))
    assert.ok(localText.includes('第二段完整正文，用于比较。'))

    const h = makeHarness(c, {
      remoteHtml: new Map([['2026-10-30', pageHtml('新热点', page.paragraphs)]])
    })
    const code = await main(['verify', '--sha', sha, '--file', file], h.deps)
    assert.equal(code, 0, logs(h))
    assert.match(logs(h), /远端部署:\s*成功/)
    assert.match(logs(h), /线上正文:\s*一致/)
    assert.doesNotMatch(logs(h), /本地构建:\s*通过/)
    assert.equal(h.state.buildCalls, 0)
    assert.equal(await localHead(c), sha)
    assert.equal(await remoteHead(c), remote)
    assert.equal((await git(c, ['status', '--porcelain'])), '')
  } finally {
    c.cleanup()
  }
})
