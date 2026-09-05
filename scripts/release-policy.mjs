import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const importantPaths = new Set([
  'index.js', 'cordis.patch.yml', 'package.json', 'pnpm-lock.yaml',
  'tsconfig.json', 'tsdown.config.ts',
])
const importantPrefixes = ['src/', 'lib/', 'scripts/', '.github/workflows/']

export function isImportantFile(file) {
  if (typeof file !== 'string') throw new Error('Changed file paths must be strings')
  const path = file.replaceAll('\\', '/').replace(/^(\.\/)+/, '')
  return importantPaths.has(path) || importantPrefixes.some(prefix => path.startsWith(prefix))
}

// BigInt avoids both lexicographic ordering (9 vs 10) and Number precision loss.
export function parseVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/.test(version)) {
    throw new Error(`Invalid version ${JSON.stringify(version)}: expected stable semver X.Y.Z (no leading zeros, prerelease or build suffix)`)
  }
  return version.split('.').map(part => BigInt(part))
}

export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  }
  return 0
}

export function assertReleaseMetadata({ version, changelog, readme }) {
  parseVersion(version)
  const escaped = version.replaceAll('.', '\\.')
  if (typeof changelog !== 'string' || !new RegExp(`^##[ \\t]+${escaped}[ \\t]*\\r?$`, 'm').test(changelog)) {
    throw new Error(`CHANGELOG.md must include a matching "## ${version}" heading for the version bump`)
  }
  const tagSpec = new RegExp('(?:^|[\\s`"\'<>])github:cloga/dsh-cron#v' + escaped + '(?=$|[\\s`"\'<>])')
  if (typeof readme !== 'string' || !tagSpec.test(readme)) {
    throw new Error(`README.md must include the GitHub install spec github:cloga/dsh-cron#v${version}`)
  }
  const tarball = new RegExp('(?:^|[^A-Za-z0-9_.-])dsh-cron-' + escaped + '\\.tgz(?=$|[^A-Za-z0-9_.-])')
  if (!tarball.test(readme)) {
    throw new Error(`README.md must include the install tarball dsh-cron-${version}.tgz`)
  }
}

export function assessChange({ baseManifest, manifest, files, changelog, readme }) {
  const version = manifest?.version
  const comparison = compareVersions(version, baseManifest?.version)
  if (!Array.isArray(files)) throw new Error('Changed files must be an array')
  const important = files.some(isImportantFile)
  if (comparison < 0) throw new Error(`Version downgrade is forbidden: ${baseManifest.version} -> ${version}`)
  if (important && comparison === 0) {
    throw new Error(`Important changes require a strictly greater package.json version than ${baseManifest.version}; also update CHANGELOG.md and README.md install metadata`)
  }
  const bumped = comparison > 0
  if (bumped) assertReleaseMetadata({ version, changelog, readme })
  return { important, bumped, version }
}

function assertSha(sha, label) {
  if (typeof sha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})(?![\s\S])/.test(sha)) {
    throw new Error(`${label} must resolve to a full Git commit SHA`)
  }
}

// tagInfo is null when refs/tags/vVERSION is absent, otherwise
// { type, sha, manifest, isAncestor }. files is the tag-to-HEAD diff.
export function assessPlan({ manifest, head, tagInfo = null, files = [], githubRef = '' }) {
  const version = manifest?.version
  parseVersion(version)
  assertSha(head, 'HEAD')
  const tag = `v${version}`
  const recovery = githubRef.startsWith('refs/tags/')
  if (recovery && githubRef !== `refs/tags/${tag}`) {
    throw new Error(`Tag recovery requires GITHUB_REF refs/tags/${tag}; received ${githubRef}`)
  }
  if (tagInfo === null) {
    if (recovery) throw new Error(`Tag recovery requires existing annotated tag ${tag} pointing to HEAD; fetch tags first`)
    return { release: true, tag, sha: head }
  }
  if (tagInfo.type !== 'tag') throw new Error(`${tag} must be an annotated tag; lightweight tags are not accepted`)
  assertSha(tagInfo.sha, tag)
  parseVersion(tagInfo.manifest?.version)
  if (tagInfo.manifest.version !== version) {
    throw new Error(`${tag} package.json version ${tagInfo.manifest.version} does not match ${version}`)
  }
  if (tagInfo.sha === head) return { release: true, tag, sha: head }
  if (recovery) throw new Error(`Tag recovery requires ${tag} to point to HEAD (${head})`)
  if (!Array.isArray(files)) throw new Error('Changed files must be an array')
  if (files.some(isImportantFile)) {
    throw new Error(`merged important changes lack a new version: ${tag} does not point to HEAD; bump package.json and update CHANGELOG.md and README.md`)
  }
  if (tagInfo.isAncestor !== true) {
    throw new Error(`${tag} is not an ancestor of HEAD; fetch complete history and investigate the release tag`)
  }
  return { release: false, tag, sha: head }
}

export function parseChangedFiles(output) {
  if (output === '') return []
  if (typeof output !== 'string' || !output.endsWith('\0')) {
    throw new Error('Expected NUL-terminated git diff --name-only -z output')
  }
  return output.slice(0, -1).split('\0')
}

function parseManifest(text, label) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`Cannot parse ${label}: ${error.message}`)
  }
}

// All Git operations are read-only; argument arrays never go through a shell.
// Dependencies are injectable so CLI behavior can be tested without Git writes.
export function runCli(args, {
  cwd = process.cwd(),
  env = process.env,
  git = argv => spawnSync('git', argv, { cwd, encoding: 'utf8', shell: false }),
  appendOutput = (path, text) => appendFileSync(path, text, 'utf8'),
  log = text => console.log(text),
} = {}) {
  const planning = args.length === 1 && args[0] === '--plan'
  const checking = args.length === 2 && args[0] === '--base'
  if (!planning && !checking) throw new Error('Usage: node scripts/release-policy.mjs --base REF | --plan')
  const base = checking ? args[1] : null
  if (checking && (typeof base !== 'string' || !base || /^-/.test(base) || /[\0\r\n]/.test(base))) {
    throw new Error('--base requires a non-option Git ref without NUL or line breaks')
  }
  const invokeGit = (argv, allowMissing = false) => {
    const result = git(argv)
    if (result.status === 0) return result.stdout ?? ''
    if (allowMissing && result.status === 1) return null
    const detail = result.error?.message || result.stderr?.trim() || `exit ${result.status}`
    throw new Error(`git ${argv[0]} failed: ${detail}. Ensure the base ref, tags and complete history are fetched`)
  }
  // Metadata and changed paths must describe the same committed candidate.
  // Never let an uncommitted version/docs edit approve a different HEAD tree.
  const readHead = name => invokeGit(['show', `HEAD:${name}`])
  // Disable rename detection so a runtime-file rename into docs cannot hide its deletion.
  const changedSince = ref => parseChangedFiles(invokeGit([
    'diff', '--name-only', '-z', '--no-renames', ref, 'HEAD', '--',
  ]))
  const manifest = parseManifest(readHead('package.json'), 'package.json')
  let decision
  if (checking) {
    decision = assessChange({
      baseManifest: parseManifest(invokeGit(['show', `${base}:package.json`]), `${base}:package.json`),
      manifest,
      files: changedSince(base),
      changelog: readHead('CHANGELOG.md'),
      readme: readHead('README.md'),
    })
  } else {
    parseVersion(manifest?.version)
    const head = invokeGit(['rev-parse', '--verify', 'HEAD^{commit}']).trim()
    const ref = `refs/tags/v${manifest.version}`
    const exists = invokeGit(['show-ref', '--verify', '--quiet', ref], true) !== null
    let tagInfo = null
    let files = []
    if (exists) {
      const type = invokeGit(['cat-file', '-t', ref]).trim()
      if (type !== 'tag') throw new Error(`${ref} must be an annotated tag; lightweight tags are not accepted`)
      const sha = invokeGit(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
      tagInfo = {
        type,
        sha,
        manifest: parseManifest(invokeGit(['show', `${ref}:package.json`]), `${ref}:package.json`),
        isAncestor: sha === head || invokeGit(['merge-base', '--is-ancestor', sha, head], true) !== null,
      }
      if (sha !== head) files = changedSince(sha)
    }
    decision = assessPlan({ manifest, head, tagInfo, files, githubRef: env.GITHUB_REF ?? '' })
    if (env.GITHUB_OUTPUT) {
      appendOutput(env.GITHUB_OUTPUT, `release=${decision.release}\ntag=${decision.tag}\nsha=${decision.sha}\n`)
    }
  }
  log(JSON.stringify(decision))
  return decision
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    console.error(`Release policy: ${error.message}`)
    process.exitCode = 1
  }
}
