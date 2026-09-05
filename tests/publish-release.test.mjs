import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import test from 'node:test'
import { loadReleaseInputs, publishRelease } from '../scripts/publish-release.mjs'

const repository = 'cloga/dsh-cron'
const token = 'fake-token-never-use-for-network'
const sha = '1'.repeat(40)
const tagSha = '2'.repeat(40)
const version = '0.4.4'
const tag = `v${version}`
const tarName = `dsh-cron-${version}.tgz`
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const tarball = Buffer.from('fake reproducible package bytes\n')
const files = () => [
  { name: tarName, data: Buffer.from(tarball) },
  { name: 'SHA256SUMS', data: Buffer.from(`${hash(tarball)}  ${tarName}\n`) },
]
const asset = (file) => ({ name: file.name, size: file.data.length, digest: `sha256:${hash(file.data)}`, state: 'uploaded' })
const inputs = (fetch) => ({ repository, token, sha, version, files: files(), fetch })
const reply = (status, data, extra = {}) => ({ status, redirected: false, json: async () => structuredClone(data), ...extra })
const annotatedRef = () => ({ ref: `refs/tags/${tag}`, object: { type: 'tag', sha: tagSha } })
const annotation = () => ({ sha: tagSha, tag, object: { type: 'commit', sha } })
const draft = () => ({ id: 7, tag_name: tag, target_commitish: sha, draft: true, prerelease: false, immutable: false })

function github({ tagged = false, release = null, assets = [], intercept, immutable = true } = {}) {
  const state = {
    ref: tagged ? annotatedRef() : null,
    object: tagged ? annotation() : null,
    release: release && structuredClone(release),
    assets: structuredClone(assets),
    calls: [],
  }
  async function fetch(url, options) {
    const parsed = new URL(url)
    assert.ok(['api.github.com', 'uploads.github.com'].includes(parsed.host))
    assert.equal(parsed.protocol, 'https:')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Authorization, `Bearer ${token}`)
    const isUpload = parsed.host === 'uploads.github.com'
    const body = options.body && (isUpload ? Buffer.from(options.body) : JSON.parse(options.body))
    const path = parsed.pathname.replace(`/repos/${repository}`, '')
    const call = { method: options.method, path, body, url, headers: options.headers }
    state.calls.push(call)
    const custom = await intercept?.(call, state)
    if (custom) return custom
    if (call.method === 'GET' && path === `/git/ref/tags/${tag}`) return reply(state.ref ? 200 : 404, state.ref)
    if (call.method === 'GET' && path === `/git/tags/${tagSha}`) return reply(200, state.object)
    if (call.method === 'POST' && path === '/git/tags') {
      assert.equal(state.ref, null)
      assert.deepEqual(body, { tag, message: `Release ${tag}`, object: sha, type: 'commit' })
      state.object = annotation()
      return reply(201, state.object)
    }
    if (call.method === 'POST' && path === '/git/refs') {
      assert.equal(state.ref, null)
      assert.deepEqual(body, { ref: `refs/tags/${tag}`, sha: tagSha })
      state.ref = annotatedRef()
      return reply(201, state.ref)
    }
    if (call.method === 'GET' && path === `/releases/tags/${tag}`) {
      // Faithfully model the published-only by-tag endpoint: drafts require listing.
      return reply(state.release && !state.release.draft ? 200 : 404, state.release?.draft ? null : state.release)
    }
    if (call.method === 'GET' && path === '/releases') return reply(200, state.release ? [state.release] : [])
    if (call.method === 'POST' && path === '/releases') {
      assert.equal(state.release, null, 'must discover existing drafts before POST')
      assert.equal(body.tag_name, tag)
      assert.equal(body.target_commitish, sha)
      assert.equal(body.draft, true)
      assert.equal(body.prerelease, false)
      state.release = draft()
      return reply(201, state.release)
    }
    if (call.method === 'GET' && path === '/releases/7') return reply(200, state.release)
    if (call.method === 'GET' && path === '/releases/7/assets') return reply(200, state.assets)
    if (call.method === 'POST' && path === '/releases/7/assets') {
      assert.equal(isUpload, true)
      assert.equal(state.release.draft, true, 'never upload to a published release')
      const name = parsed.searchParams.get('name')
      assert.equal(state.assets.some((item) => item.name === name), false, 'never replace an existing asset')
      assert.deepEqual(body, files().find((file) => file.name === name).data)
      assert.equal(options.headers['Content-Length'], String(body.length))
      const result = asset({ name, data: body })
      state.assets.push(result)
      return reply(201, result)
    }
    if (call.method === 'PATCH' && path === '/releases/7') {
      assert.deepEqual(body, { draft: false })
      assert.deepEqual(state.assets.filter((item) => [tarName, 'SHA256SUMS'].includes(item.name)), files().map(asset))
      state.release.draft = false
      state.release.immutable = immutable
      return reply(200, state.release)
    }
    assert.fail(`Unexpected fixture request: ${call.method} ${path}`)
  }
  return { state, fetch, writes: () => state.calls.filter((call) => call.method !== 'GET') }
}

test('fresh publication creates an annotated exact-SHA tag, drafts, uploads, then publishes immutable', async () => {
  const api = github()
  assert.deepEqual(await publishRelease(inputs(api.fetch)), { id: 7, tag, sha, immutable: true, draft: false })
  assert.deepEqual(api.writes().map(({ method, path }) => `${method} ${path}`), [
    'POST /git/tags', 'POST /git/refs', 'POST /releases',
    'POST /releases/7/assets', 'POST /releases/7/assets', 'PATCH /releases/7',
  ])
  assert.equal(api.state.release.immutable, true)
})

test('rerun is read-only and verifies tag plus both asset digests and sizes', async () => {
  const api = github()
  await publishRelease(inputs(api.fetch))
  api.state.calls.length = 0
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().length, 0)
  assert.ok(api.state.calls.some((call) => call.path === '/releases/7/assets'))
})

test('partial draft discovered through release listing resumes only the missing asset', async () => {
  const api = github({ tagged: true, release: draft(), assets: [asset(files()[0])] })
  await publishRelease(inputs(api.fetch))
  assert.deepEqual(api.writes().map(({ method, path }) => `${method} ${path}`), ['POST /releases/7/assets', 'PATCH /releases/7'])
  assert.equal(new URL(api.writes()[0].url).searchParams.get('name'), 'SHA256SUMS')
})

test('fully uploaded draft publishes without uploading again', async () => {
  const api = github({ tagged: true, release: draft(), assets: files().map(asset) })
  await publishRelease(inputs(api.fetch))
  assert.deepEqual(api.writes().map(({ method }) => method), ['PATCH'])
})

for (const [label, corrupt] of [
  ['lightweight tag', (state) => { state.ref.object = { type: 'commit', sha } }],
  ['wrong commit', (state) => { state.object.object.sha = '3'.repeat(40) }],
  ['nested annotated tag', (state) => { state.object.object.type = 'tag' }],
  ['wrong tag object SHA', (state) => { state.object.sha = '3'.repeat(40) }],
  ['wrong tag name', (state) => { state.object.tag = 'v99.0.0' }],
  ['wrong ref', (state) => { state.ref.ref = 'refs/tags/v99.0.0' }],
]) {
  test(`rejects ${label} before any writes`, async () => {
    const api = github({ tagged: true })
    corrupt(api.state)
    await assert.rejects(publishRelease(inputs(api.fetch)), /tag/i)
    assert.equal(api.writes().length, 0)
  })
}

for (const [label, corrupt] of [
  ['size', (item) => { item.size++ }],
  ['digest', (item) => { item.digest = `sha256:${'0'.repeat(64)}` }],
  ['missing digest', (item) => { delete item.digest }],
  ['starter upload', (item) => { item.state = 'starter' }],
]) {
  test(`rejects existing asset ${label}, without uploads or publication`, async () => {
    const damaged = asset(files()[1])
    corrupt(damaged)
    // Tarball is missing, but the later checksum mismatch must block even its upload.
    const api = github({ tagged: true, release: draft(), assets: [damaged] })
    await assert.rejects(publishRelease(inputs(api.fetch)), /asset mismatch/)
    assert.equal(api.writes().length, 0)
  })
}

test('duplicate named assets fail closed', async () => {
  const api = github({ tagged: true, release: draft(), assets: [asset(files()[0]), asset(files()[0])] })
  await assert.rejects(publishRelease(inputs(api.fetch)), /Duplicate/)
  assert.equal(api.writes().length, 0)
})

test('failing second upload leaves the release draft, with no retry, delete, or publish', async () => {
  const api = github({ intercept: (call) => {
    if (call.method === 'POST' && call.url.endsWith('name=SHA256SUMS')) return reply(502, {})
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /HTTP 502/)
  assert.equal(api.state.release.draft, true)
  assert.equal(api.state.assets.length, 1)
  assert.equal(api.writes().filter((call) => call.url.endsWith('name=SHA256SUMS')).length, 1)
  assert.equal(api.writes().some((call) => ['PATCH', 'DELETE'].includes(call.method)), false)
})

test('upload mismatch returned by GitHub leaves the draft unpublished', async () => {
  const api = github({ tagged: true, release: draft(), intercept: (call) => {
    if (call.method === 'POST') return reply(201, { ...asset(files()[0]), digest: null })
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /asset mismatch/)
  assert.equal(api.state.release.draft, true)
  assert.equal(api.writes().length, 1)
})

test('checksum mismatch is rejected before any network request', async () => {
  const args = inputs(() => assert.fail('must not contact GitHub'))
  args.files[0].data = Buffer.from('tampered artifact')
  await assert.rejects(publishRelease(args), /checksum mismatch/)
})

for (const bad of ['../dsh-cron-0.4.4.tgz', 'dsh-cron-0.4.5.tgz', `${tarName}\n${hash(tarball)}  extra.tgz`]) {
  test(`checksum manifest rejects unexpected entry ${JSON.stringify(bad)}`, async () => {
    const args = inputs(() => assert.fail('must not contact GitHub'))
    args.files[1].data = Buffer.from(`${hash(tarball)}  ${bad}\n`)
    await assert.rejects(publishRelease(args), /SHA256SUMS/)
  })
}

test('checksum parser accepts standard sha256sum binary-marker and CRLF output', async () => {
  const args = inputs(null)
  args.files[1].data = Buffer.from(`${hash(tarball)} *${tarName}\r\n`)
  // Published matching assets avoid the fresh fixture's fixed checksum bytes expectation.
  const api = github({ tagged: true, release: { ...draft(), draft: false, immutable: true }, assets: args.files.map(asset) })
  args.fetch = api.fetch
  await publishRelease(args)
})

test('ref-creation 422 reconciles exact existing annotated ref once without retrying POST', async () => {
  const api = github({ intercept: (call, state) => {
    if (call.method === 'POST' && call.path === '/git/refs') {
      state.ref = annotatedRef()
      return reply(422, {})
    }
  } })
  await publishRelease(inputs(api.fetch))
  const index = api.state.calls.findIndex((call) => call.method === 'POST' && call.path === '/git/refs')
  assert.equal(api.state.calls[index + 1].method, 'GET')
  assert.equal(api.state.calls[index + 1].path, `/git/ref/tags/${tag}`)
  assert.equal(api.writes().filter((call) => call.path === '/git/refs').length, 1)
})

test('ref-creation 422 with conflicting ref fails without moving the tag or retrying', async () => {
  const api = github({ intercept: (call, state) => {
    if (call.method === 'POST' && call.path === '/git/refs') {
      state.ref = annotatedRef()
      state.object.object.sha = '3'.repeat(40)
      return reply(422, {})
    }
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /exact expected commit/)
  assert.equal(api.writes().length, 2)
})

test('ref-creation 422 with absent ref fails after one reconciliation GET', async () => {
  const api = github({ intercept: (call) => call.method === 'POST' && call.path === '/git/refs' ? reply(422, {}) : undefined })
  await assert.rejects(publishRelease(inputs(api.fetch)), /HTTP 404/)
  assert.equal(api.state.calls.filter((call) => call.path === `/git/ref/tags/${tag}`).length, 2)
  assert.equal(api.writes().length, 2)
})

test('uncertain release POST fails without retry; next invocation discovers the created draft', async () => {
  let lostResponse = false
  const api = github({ tagged: true, intercept: (call, state) => {
    if (call.method === 'POST' && call.path === '/releases' && !lostResponse) {
      state.release = draft()
      lostResponse = true
      throw new Error(`connection reset with secret ${token}`)
    }
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), (error) => /uncertain/.test(error.message) && !error.message.includes(token))
  assert.equal(api.writes().length, 1)
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().filter((call) => call.path === '/releases').length, 1)
})

test('uncertain asset upload reconciles matching bytes on rerun instead of uploading again', async () => {
  let lostResponse = false
  const api = github({ tagged: true, release: draft(), intercept: (call, state) => {
    if (call.method === 'POST' && call.path === '/releases/7/assets' && !lostResponse) {
      state.assets.push(asset(files()[0]))
      lostResponse = true
      throw new Error(`lost upload response ${token}`)
    }
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), (error) => /uncertain/.test(error.message) && !error.message.includes(token))
  assert.equal(api.state.release.draft, true)
  assert.equal(api.writes().length, 1)
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().filter((call) => new URL(call.url).searchParams.get('name') === tarName).length, 1)
})

test('asset-upload conflict fails without retry, replacement, or publication', async () => {
  const api = github({ tagged: true, release: draft(), intercept: (call) => {
    if (call.method === 'POST' && call.path === '/releases/7/assets') return reply(422, {})
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /HTTP 422/)
  assert.equal(api.writes().length, 1)
  assert.equal(api.state.release.draft, true)
})

test('release creation conflict never blind-retries POST', async () => {
  const api = github({ tagged: true, intercept: (call) => call.method === 'POST' && call.path === '/releases' ? reply(422, {}) : undefined })
  await assert.rejects(publishRelease(inputs(api.fetch)), /HTTP 422/)
  assert.equal(api.writes().length, 1)
})

test('uncertain publish PATCH is not retried and the next run is read-only', async () => {
  const api = github({ tagged: true, release: draft(), assets: files().map(asset), intercept: (call, state) => {
    if (call.method === 'PATCH') {
      state.release.draft = false
      state.release.immutable = true
      throw new Error('lost response')
    }
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /uncertain/)
  api.state.calls.length = 0
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().length, 0)
})

test('published release with a missing asset fails without repair or overwrite', async () => {
  const api = github({ tagged: true, release: { ...draft(), draft: false, immutable: true }, assets: [asset(files()[0])] })
  await assert.rejects(publishRelease(inputs(api.fetch)), /missing required assets/)
  assert.equal(api.writes().length, 0)
})

test('published release with a mismatching asset fails without writes', async () => {
  const damaged = files().map(asset)
  damaged[0].size++
  const api = github({ tagged: true, release: { ...draft(), draft: false, immutable: true }, assets: damaged })
  await assert.rejects(publishRelease(inputs(api.fetch)), /asset mismatch/)
  assert.equal(api.writes().length, 0)
})

for (const immutable of [false, undefined]) {
  test(`existing published release requires immutable=true, not ${immutable}`, async () => {
    const api = github({ tagged: true, release: { ...draft(), draft: false, immutable }, assets: files().map(asset) })
    await assert.rejects(publishRelease(inputs(api.fetch)), /not immutable/)
    assert.equal(api.writes().length, 0)
  })
}

test('publishing with immutable releases disabled fails loudly instead of reporting success', async () => {
  const api = github({ immutable: false })
  await assert.rejects(publishRelease(inputs(api.fetch)), /not immutable/)
  assert.equal(api.state.release.draft, false)
  assert.equal(api.writes().filter((call) => call.method === 'PATCH').length, 1)
})

test('draft target mismatch and prerelease metadata fail before upload', async () => {
  for (const changed of [{ target_commitish: 'main' }, { prerelease: true }, { immutable: true }]) {
    const api = github({ tagged: true, release: { ...draft(), ...changed } })
    await assert.rejects(publishRelease(inputs(api.fetch)), /release|Release/)
    assert.equal(api.writes().length, 0)
  }
})

test('no credential redirect: official endpoints, redirect:error, ignore attacker upload_url', async () => {
  const api = github({ tagged: true, release: { ...draft(), upload_url: `https://attacker.invalid/${token}{?name,label}` } })
  await publishRelease(inputs(api.fetch))
  assert.ok(api.state.calls.every((call) => ['api.github.com', 'uploads.github.com'].includes(new URL(call.url).host)))
  assert.ok(api.state.calls.every((call) => !call.url.includes(token)))
})

test('redirect status is rejected without a second request or echoed response body', async () => {
  let calls = 0
  await assert.rejects(publishRelease(inputs(async (_url, options) => {
    calls++
    assert.equal(options.redirect, 'error')
    return reply(302, { secret: token }, { headers: { get: () => 'https://attacker.invalid' } })
  })), (error) => /HTTP 302/.test(error.message) && !error.message.includes(token))
  assert.equal(calls, 1)
})

test('a fetch implementation returning an already redirected response is rejected', async () => {
  await assert.rejects(publishRelease(inputs(async () => reply(200, annotatedRef(), { redirected: true, url: 'https://attacker.invalid' }))), /redirected/)
})

test('network exceptions never expose credentials or retry automatically', async () => {
  let calls = 0
  await assert.rejects(publishRelease(inputs(async () => { calls++; throw new Error(token) })), (error) => !error.message.includes(token) && /uncertain/.test(error.message))
  assert.equal(calls, 1)
})

test('every GitHub request receives a fresh 60-second timeout signal', async (context) => {
  const signals = []
  context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 60_000)
    const signal = new AbortController().signal
    signals.push(signal)
    return signal
  })
  const api = github()
  let calls = 0
  await publishRelease(inputs(async (url, options) => {
    assert.equal(options.signal, signals[calls++])
    assert.equal(options.signal.aborted, false)
    return api.fetch(url, options)
  }))
  assert.equal(calls, signals.length)
  assert.ok(calls > 6)
  assert.equal(new Set(signals).size, calls)
})

test('a timed-out upload fails uncertain, leaves its draft, and never retries the write', async (context) => {
  let controller
  context.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 60_000)
    controller = new AbortController()
    return controller.signal
  })
  const api = github({ tagged: true, release: draft() })
  let uploadAttempts = 0
  await assert.rejects(publishRelease(inputs(async (url, options) => {
    assert.equal(options.signal, controller.signal)
    if (options.method === 'POST' && new URL(url).host === 'uploads.github.com') {
      uploadAttempts++
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        controller.abort(new DOMException(`Timed out with secret ${token}`, 'TimeoutError'))
      })
    }
    return api.fetch(url, options)
  })), (error) => /uncertain/.test(error.message) && !error.message.includes(token))
  assert.equal(uploadAttempts, 1)
  assert.equal(api.state.release.draft, true)
  assert.equal(api.state.assets.length, 0)
  assert.equal(api.writes().length, 0, 'no publication or other write follows the timeout')
})

test('input repository, token, SHA, version, and artifact names fail before fetch', async () => {
  const invalid = [
    { repository: 'attacker/dsh-cron' }, { repository: 'cloga/dsh-cron/../another' },
    { token: '' }, { token: 'secret\nvalue' },
    { sha: 'main' }, { sha: 'a'.repeat(39) }, { sha: 'A'.repeat(40) },
    ...['01.2.3', '1.2', 'v1.2.3', '1.2.3-rc.1', '1.2.3+build', '1.2.3\n', '1.2.3.4'].map((version) => ({ version })),
    { files: [] }, { files: [files()[0], files()[0]] },
    { files: [{ ...files()[0], data: 'not bytes' }, files()[1]] },
  ]
  for (const value of invalid) await assert.rejects(publishRelease({ ...inputs(() => assert.fail('must not fetch')), ...value }))
})

test('pagination discovers older drafts and required assets without following Link headers', async () => {
  const api = github({ tagged: true, release: draft(), assets: files().map(asset), intercept: (call) => {
    if (call.method === 'GET' && call.path === '/releases' && new URL(call.url).searchParams.get('page') === '1') {
      return reply(200, Array.from({ length: 100 }, (_, i) => ({ id: i + 100, tag_name: `v9.9.${i}` })))
    }
    if (call.method === 'GET' && call.path === '/releases/7/assets' && new URL(call.url).searchParams.get('page') === '1') {
      return reply(200, Array.from({ length: 100 }, (_, i) => ({ name: `extra-${i}` })))
    }
  } })
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().length, 1)
  assert.ok(api.state.calls.some((call) => call.url.includes('page=2')))
})

test('concurrent publication is reconciled and never followed by asset writes', async () => {
  const api = github({ tagged: true, release: draft(), intercept: (call, state) => {
    if (call.method === 'GET' && call.path === '/releases/7') {
      state.release.draft = false
      state.release.immutable = true
      state.assets = files().map(asset)
    }
  } })
  await publishRelease(inputs(api.fetch))
  assert.equal(api.writes().length, 0)
})

test('changed tag before final publish leaves uploaded assets in draft', async () => {
  let refReads = 0
  const api = github({ tagged: true, intercept: (call, state) => {
    if (call.method === 'GET' && call.path === `/git/ref/tags/${tag}` && ++refReads === 2) state.object.object.sha = '3'.repeat(40)
  } })
  await assert.rejects(publishRelease(inputs(api.fetch)), /exact expected commit/)
  assert.equal(api.state.release.draft, true)
  assert.equal(api.writes().some((call) => call.method === 'PATCH'), false)
})

function localOptions(overrides = {}) {
  const readPaths = []
  const options = {
    directory: '/fixture', expectedVersion: version,
    env: { GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, GITHUB_SHA: sha },
    readHead: () => sha,
    read: async (path) => {
      readPaths.push(path)
      if (basename(path) === 'package.json') return JSON.stringify({ name: 'dsh-cron', version })
      const file = files().find((file) => file.name === basename(path))
      assert.ok(file, 'reads only expected artifact files')
      return file.data
    },
    ...overrides,
  }
  return { options, readPaths }
}

test('CLI preflight checks manifest, exact HEAD, expected version, and fixed artifact paths without git writes', async () => {
  const { options, readPaths } = localOptions()
  const result = await loadReleaseInputs(options)
  assert.deepEqual(result, { repository, token, sha, version, files: files() })
  assert.deepEqual(readPaths, [join('/fixture', 'package.json'), join('/fixture', 'artifacts', tarName), join('/fixture', 'artifacts', 'SHA256SUMS')])
})

test('CLI preflight rejects wrong HEAD, expected version, unstable manifest, and missing artifacts', async () => {
  for (const [overrides, pattern] of [
    [{ readHead: () => '3'.repeat(40) }, /git HEAD/],
    [{ expectedVersion: '0.4.5' }, /exact expected/],
    [{ expectedVersion: undefined }, /Usage/],
    [{ read: async () => JSON.stringify({ name: 'dsh-cron', version: '0.4.4-rc.1' }) }, /stable version/],
    [{ readHead: () => { throw new Error(token) } }, /Cannot read git HEAD/],
    [{ read: async () => { throw new Error(token) } }, /Cannot read package.json/],
    [{ read: async (path) => {
      if (basename(path) === 'package.json') return JSON.stringify({ name: 'dsh-cron', version })
      throw new Error(token)
    } }, /Cannot read required/],
  ]) {
    await assert.rejects(loadReleaseInputs(localOptions(overrides).options), (error) => pattern.test(error.message) && !error.message.includes(token))
  }
})
