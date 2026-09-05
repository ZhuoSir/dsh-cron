import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPOSITORY = 'cloga/dsh-cron'
const root = fileURLToPath(new URL('..', import.meta.url))
const isVersion = (value) => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) && value.trim() === value
const isSha = (value) => typeof value === 'string' && value.length === 40 && /^[0-9a-f]{40}$/.test(value)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const check = (condition, message) => { if (!condition) throw new Error(message) }

function validateInputs({ repository, token, sha, version, files }) {
  check(repository === REPOSITORY, 'GITHUB_REPOSITORY must be cloga/dsh-cron')
  check(typeof token === 'string' && token.length > 0 && !/\s/.test(token), 'GITHUB_TOKEN is required and must not contain whitespace')
  check(isSha(sha), 'GITHUB_SHA must be an exact lowercase 40-character commit SHA')
  check(isVersion(version), 'Version must be a strict stable X.Y.Z version')
  const names = [`dsh-cron-${version}.tgz`, 'SHA256SUMS']
  check(Array.isArray(files) && files.length === 2, 'Exactly the versioned tarball and SHA256SUMS are required')
  const assets = names.map((name) => {
    const matches = files.filter((file) => file?.name === name)
    check(matches.length === 1 && matches[0].data instanceof Uint8Array, 'Required artifact missing, duplicated, or not bytes')
    // Own the bytes before the first await so callers cannot change an upload after validation.
    const data = Buffer.from(matches[0].data)
    check(data.length > 0, 'Artifacts must not be empty')
    return { name, data, size: data.length, digest: `sha256:${digest(data)}` }
  })
  const lines = assets[1].data.toString('utf8').split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  check(lines.length === 1, 'SHA256SUMS must contain exactly one tarball entry')
  const entry = /^([a-fA-F0-9]{64}) [ *](\S+)$/.exec(lines[0])
  check(entry && entry[2] === names[0], 'SHA256SUMS must name the exact versioned tarball without a path')
  check(`sha256:${entry[1].toLowerCase()}` === assets[0].digest, 'Local tarball checksum mismatch; refusing network writes')
  return assets
}

/**
 * Publish preloaded, checked artifact bytes. No filesystem or git operations occur here.
 * files: [{ name: 'dsh-cron-X.Y.Z.tgz', data: Uint8Array }, { name: 'SHA256SUMS', data: Uint8Array }].
 * Callers must establish that sha is their checked-out HEAD and version is package.json's version.
 * Writes are never retried (except a ref POST 422 is reconciled with one exact GET).
 * An uncertain write fails closed; a later invocation reconciles remote state with GETs.
 */
export async function publishRelease({ repository, token, sha, version, files, fetch: fetchImpl = globalThis.fetch }) {
  const assets = validateInputs({ repository, token, sha, version, files })
  check(typeof fetchImpl === 'function', 'A fetch implementation is required')
  const tag = `v${version}`
  const base = `https://api.github.com/repos/${repository}`
  const refPath = `/git/ref/tags/${tag}`

  async function request(method, path, { body, bytes, statuses = [200], upload = false } = {}) {
    // Never follow upload_url, assets_url, Location, or pagination Link values from a response.
    const url = upload ? `https://uploads.github.com/repos/${repository}${path}` : `${base}${path}`
    const parsed = new URL(url)
    check(['https://api.github.com', 'https://uploads.github.com'].includes(parsed.origin)
      && !parsed.username && !parsed.password, 'Refusing non-official API endpoint')
    let response
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        // Bound each request, including response-body consumption; a timed-out write
        // is uncertain and must be reconciled on the next run, never retried here.
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(bytes ? { 'Content-Type': path.includes('name=SHA256SUMS') ? 'text/plain' : 'application/gzip', 'Content-Length': String(bytes.length) }
            : body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(bytes ? { body: bytes } : body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      // Do not include fetch exceptions, response bodies, or credentials in diagnostics.
      throw new Error(`GitHub ${method} request failed; outcome may be uncertain. Rerun to reconcile; no write was retried.`)
    }
    check(response && !response.redirected && (!response.url || response.url === url), 'Refusing redirected GitHub response')
    check(statuses.includes(response.status), `GitHub ${method} returned HTTP ${Number(response.status)}; stopped without retrying writes`)
    if (response.status === 404 || response.status === 422) return { status: response.status, data: null }
    let data
    try { data = await response.json() } catch { throw new Error('Invalid GitHub JSON response; stopped without retrying writes') }
    return { status: response.status, data }
  }

  function validateTagObject(object, objectSha) {
    check(object && object.sha === objectSha && object.tag === tag
      && object.object?.type === 'commit' && object.object.sha === sha,
    'Annotated tag object does not point to the exact expected commit SHA')
  }

  async function verifyRef(ref) {
    check(ref?.ref === `refs/tags/${tag}` && ref.object?.type === 'tag' && isSha(ref.object.sha),
      'Existing tag must be the exact annotated tag, not a lightweight tag')
    const { data: object } = await request('GET', `/git/tags/${ref.object.sha}`)
    validateTagObject(object, ref.object.sha)
  }

  async function verifyTag() {
    const { data } = await request('GET', refPath)
    await verifyRef(data)
  }

  const existingRef = await request('GET', refPath, { statuses: [200, 404] })
  if (existingRef.status === 404) {
    const { data: object } = await request('POST', '/git/tags', {
      statuses: [201], body: { tag, message: `Release ${tag}`, object: sha, type: 'commit' },
    })
    check(isSha(object?.sha), 'Invalid annotated tag SHA returned by GitHub')
    validateTagObject(object, object.sha)
    await request('POST', '/git/refs', {
      statuses: [201, 422], body: { ref: `refs/tags/${tag}`, sha: object.sha },
    })
    // Both success and 422 require the same exact-ref reconciliation. Never POST again.
    await verifyTag()
  } else {
    await verifyRef(existingRef.data)
  }

  async function list(path) {
    const items = []
    // Bounded, explicit pagination avoids following server-controlled Link URLs.
    for (let page = 1; page <= 100; page++) {
      const { data } = await request('GET', `${path}?per_page=100&page=${page}`)
      check(Array.isArray(data), 'Invalid GitHub list response')
      items.push(...data)
      if (data.length < 100) return items
    }
    throw new Error('GitHub pagination limit reached; refusing an incomplete reconciliation')
  }

  function validateRelease(release, id) {
    check(release && Number.isSafeInteger(release.id) && release.id > 0 && (id === undefined || release.id === id)
      && release.tag_name === tag && typeof release.draft === 'boolean' && release.prerelease === false,
    'Release metadata does not match the expected stable version')
    check(!release.draft || (release.target_commitish === sha && release.immutable !== true),
      'Draft release must target the exact expected commit and remain mutable')
  }

  let { data: release } = await request('GET', `/releases/tags/${tag}`, { statuses: [200, 404] })
  if (!release) {
    // The by-tag endpoint documents published releases only; drafts need the list endpoint.
    const matches = (await list('/releases')).filter((item) => item?.tag_name === tag)
    check(matches.length <= 1, 'Multiple releases found for the tag; refusing ambiguous publication')
    release = matches[0]
  }
  if (!release) {
    ;({ data: release } = await request('POST', '/releases', {
      statuses: [201],
      body: { tag_name: tag, target_commitish: sha, name: tag, body: `Release ${tag}. See CHANGELOG.md for details.`, draft: true, prerelease: false },
    }))
    check(release?.draft === true, 'GitHub did not create a draft; refusing asset writes')
  }
  validateRelease(release)
  const id = release.id
  const releasePath = `/releases/${id}`

  async function readRelease() {
    const { data } = await request('GET', releasePath)
    validateRelease(data, id)
    return data
  }

  function verifyAsset(remote, local) {
    check(remote?.name === local.name && remote.state === 'uploaded' && remote.size === local.size && remote.digest === local.digest,
      `Release asset mismatch for ${local.name}; never deleting or replacing assets`)
  }

  async function missingAssets() {
    const remote = await list(`${releasePath}/assets`)
    return assets.filter((local) => {
      const matches = remote.filter((item) => item?.name === local.name)
      check(matches.length <= 1, `Duplicate release asset ${local.name}; refusing publication`)
      if (matches.length) verifyAsset(matches[0], local)
      return matches.length === 0
    })
  }

  async function verifyPublished(current) {
    check(current.draft === false, 'Release is still a draft; publication did not complete')
    check(current.immutable === true, 'Published release is not immutable; enable immutable releases in repository settings. Refusing to claim success.')
    check((await missingAssets()).length === 0, 'Published release is missing required assets; refusing to overwrite or repair it')
    await verifyTag()
    return { id, tag, sha, immutable: true, draft: false }
  }

  if (!release.draft) return verifyPublished(release)
  const missing = await missingAssets() // Check ALL existing assets before any upload.
  for (const local of missing) {
    release = await readRelease()
    if (!release.draft) return verifyPublished(release)
    const { data: uploaded } = await request('POST', `${releasePath}/assets?name=${encodeURIComponent(local.name)}`, {
      upload: true, bytes: local.data, statuses: [201],
    })
    verifyAsset(uploaded, local)
  }
  await verifyTag()
  release = await readRelease()
  if (!release.draft) return verifyPublished(release)
  check((await missingAssets()).length === 0, 'Draft is missing required assets; refusing publication')
  await request('PATCH', releasePath, { body: { draft: false } })
  return verifyPublished(await readRelease())
}

/** Read-only CLI preflight. Injectable readers let tests avoid real git and filesystem writes. */
export async function loadReleaseInputs({
  expectedVersion,
  env = process.env,
  directory = root,
  read = readFile,
  readHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
} = {}) {
  check(isVersion(expectedVersion), 'Usage: node scripts/publish-release.mjs <expected-version> (stable X.Y.Z required)')
  let manifest
  try { manifest = JSON.parse(await read(join(directory, 'package.json'), 'utf8')) } catch { throw new Error('Cannot read package.json') }
  check(manifest?.name === 'dsh-cron' && isVersion(manifest.version) && manifest.version === expectedVersion,
    'package.json must identify dsh-cron at the exact expected stable version')
  let head
  try { head = await readHead() } catch { throw new Error('Cannot read git HEAD') }
  check(isSha(env.GITHUB_SHA) && head === env.GITHUB_SHA, 'git HEAD must equal the exact GITHUB_SHA')
  const files = []
  for (const name of [`dsh-cron-${manifest.version}.tgz`, 'SHA256SUMS']) {
    let data
    try { data = await read(join(directory, 'artifacts', name)) } catch { throw new Error('Cannot read required release artifact') }
    files.push({ name, data })
  }
  const inputs = { repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, sha: head, version: manifest.version, files }
  validateInputs(inputs)
  return inputs
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    check(process.argv.length === 3, 'Usage: node scripts/publish-release.mjs <expected-version>')
    const result = await publishRelease(await loadReleaseInputs({ expectedVersion: process.argv[2] }))
    console.log(`Published immutable ${result.tag} at ${result.sha}`)
  } catch (error) {
    // Defense in depth even if a future validation message accidentally contains a secret.
    const message = error instanceof Error ? error.message : 'Publication failed'
    console.error(process.env.GITHUB_TOKEN ? message.replaceAll(process.env.GITHUB_TOKEN, '[REDACTED]') : message)
    process.exitCode = 1
  }
}
