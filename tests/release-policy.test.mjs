import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessChange, assessPlan, assertReleaseMetadata, compareVersions,
  isImportantFile, parseChangedFiles, parseVersion, runCli,
} from '../scripts/release-policy.mjs'

const head = 'a'.repeat(40)
const previous = 'b'.repeat(40)
const manifest = { name: 'dsh-cron', version: '0.4.4' }
const metadata = version => ({
  changelog: `# Changelog\n\n## ${version}\n\n- Release policy.\n`,
  readme: `dsh plugin --profile web add github:cloga/dsh-cron#v${version}\ndsh plugin --profile web add ./dsh-cron-${version}.tgz\n`,
})
const change = (overrides = {}) => assessChange({
  baseManifest: { version: '0.4.3' }, manifest, files: ['index.js'],
  ...metadata(manifest.version), ...overrides,
})
const tagInfo = (overrides = {}) => ({
  type: 'tag', sha: previous, manifest, isAncestor: true, ...overrides,
})
const plan = (overrides = {}) => assessPlan({ manifest, head, ...overrides })

test('important paths conservatively cover every runtime and delivery entry point', () => {
  for (const path of [
    'index.js', 'src/client/index.tsx', 'src/tests/fixture.ts', 'lib/client.js',
    'cordis.patch.yml', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json',
    'tsdown.config.ts', 'scripts/release-policy.mjs', 'scripts/nested/tool.mjs',
    '.github/workflows/ci.yml', './src/new.ts', '.github\\workflows\\release.yml',
  ]) assert.equal(isImportantFile(path), true, path)
  for (const path of [
    'README.md', 'CHANGELOG.md', 'RELEASE.md', 'AGENTS.md', 'docs/runtime.md',
    'tests/release-policy.test.mjs', 'docs/index.js', 'package.json.md', 'src-notes.md',
    'scripts.md', '.github/ISSUE_TEMPLATE/bug.yml', '.github/workflows.md',
  ]) assert.equal(isImportantFile(path), false, path)
  assert.throws(() => isImportantFile(null), /paths must be strings/)
})

test('stable versions compare numerically, including components greater than 9', () => {
  for (const [newer, older] of [
    ['0.4.10', '0.4.9'], ['0.10.0', '0.9.99'], ['10.0.0', '9.99.99'],
    ['1.0.0', '0.99.99'], ['0.4.100', '0.4.99'],
    ['9007199254740993.0.0', '9007199254740992.0.0'],
  ]) {
    assert.equal(compareVersions(newer, older), 1)
    assert.equal(compareVersions(older, newer), -1)
    assert.equal(compareVersions(newer, newer), 0)
  }
  assert.deepEqual(parseVersion('0.0.0'), [0n, 0n, 0n])
})

test('malformed, prerelease, build and non-canonical versions fail closed', () => {
  for (const version of [
    undefined, null, 123, '', '1', '1.0', '1.0.0.0', 'v1.0.0', '01.0.0',
    '1.01.0', '1.0.00', '-1.0.0', '1.0.0-alpha.1', '1.0.0+build.1',
    ' 1.0.0', '1.0.0 ', '1.0.0\n', '1.0.0\r\n',
  ]) {
    assert.throws(() => parseVersion(version), /stable semver/)
    assert.throws(() => change({ manifest: { version } }), /stable semver/)
    assert.throws(() => change({ baseManifest: { version } }), /stable semver/)
    assert.throws(() => plan({ manifest: { version } }), /stable semver/)
  }
})

test('important changes need a bump; docs/tests-only changes may skip release', () => {
  assert.deepEqual(change(), { important: true, bumped: true, version: '0.4.4' })
  assert.throws(() => change({ manifest: { version: '0.4.3' } }), /strictly greater/)
  assert.deepEqual(change({
    manifest: { version: '0.4.3' }, files: ['docs/design.md', 'tests/new.test.mjs'],
    changelog: undefined, readme: undefined,
  }), { important: false, bumped: false, version: '0.4.3' })
  assert.deepEqual(change({ files: [] }), { important: false, bumped: true, version: '0.4.4' })
})

test('no downgrade is allowed, even with no important files', () => {
  for (const files of [[], ['README.md'], ['index.js']]) {
    assert.throws(() => change({ manifest: { version: '0.4.2' }, files }), /downgrade is forbidden/)
  }
})

test('any bump needs matching changelog heading and both README install forms', () => {
  for (const files of [['src/new.ts'], ['docs/design.md'], []]) {
    assert.throws(() => change({ files, changelog: undefined }), /CHANGELOG.md/)
    assert.throws(() => change({ files, readme: undefined }), /README.md/)
  }
  for (const changelog of ['', '## Unreleased', '### 0.4.4', '## 0.4.40', '## v0.4.4', '## 0.4.4-alpha.1']) {
    assert.throws(() => change({ changelog }), /matching "## 0.4.4"/)
  }
  for (const readme of [
    '', 'dsh-cron-0.4.4.tgz', '#v0.4.4 dsh-cron-0.4.4.tgz',
    'github:cloga/dsh-cron#v0.4.40 dsh-cron-0.4.4.tgz',
    'github:cloga/dsh-cron#v0.4.4-beta dsh-cron-0.4.4.tgz',
    'github:someone-else/dsh-cron#v0.4.4 dsh-cron-0.4.4.tgz',
    'github:cloga/other-package#v0.4.4 dsh-cron-0.4.4.tgz',
    'fakegithub:cloga/dsh-cron#v0.4.4 dsh-cron-0.4.4.tgz',
  ]) assert.throws(() => change({ readme }), /install spec github:cloga\/dsh-cron#v0.4.4/)
  for (const suffix of ['', 'dsh-cron-0.4.40.tgz', 'dsh-cron-0.4.4.tgz.backup', 'other-dsh-cron-0.4.4.tgz']) {
    assert.throws(() => change({ readme: `github:cloga/dsh-cron#v0.4.4\n${suffix}` }), /install tarball/)
  }
  assert.doesNotThrow(() => assertReleaseMetadata({
    version: '0.4.4', ...metadata('0.4.4'), changelog: '## 0.4.4\r\n',
  }))
})

test('plan releases absent tags and reruns a tag already at HEAD', () => {
  assert.deepEqual(plan(), { release: true, tag: 'v0.4.4', sha: head })
  assert.deepEqual(plan({ tagInfo: tagInfo({ sha: head }) }), { release: true, tag: 'v0.4.4', sha: head })
})

test('plan skips only non-important changes since an older annotated tag', () => {
  assert.deepEqual(plan({ tagInfo: tagInfo(), files: ['README.md', 'tests/policy.test.mjs'] }), {
    release: false, tag: 'v0.4.4', sha: head,
  })
  assert.deepEqual(plan({ tagInfo: tagInfo(), files: [] }), { release: false, tag: 'v0.4.4', sha: head })
  for (const path of ['index.js', 'src/client/new.ts', 'lib/client.js', 'package.json', 'scripts/tool.mjs', '.github/workflows/ci.yml']) {
    assert.throws(() => plan({ tagInfo: tagInfo(), files: [path] }), /merged important changes lack a new version/)
  }
  assert.throws(() => plan({ tagInfo: tagInfo({ isAncestor: false }), files: ['README.md'] }), /not an ancestor/)
})

test('plan rejects lightweight tags and inconsistent tag manifests even at HEAD', () => {
  for (const sha of [head, previous]) {
    assert.throws(() => plan({ tagInfo: tagInfo({ type: 'commit', sha }) }), /annotated tag/)
    assert.throws(() => plan({ tagInfo: tagInfo({ sha, manifest: { version: '0.4.3' } }) }), /does not match/)
    assert.throws(() => plan({ tagInfo: tagInfo({ sha, manifest: {} }) }), /stable semver/)
  }
  assert.throws(() => plan({ head: 'not-a-sha' }), /full Git commit SHA/)
})

test('tag-trigger recovery requires the exact current version tag at HEAD', () => {
  assert.deepEqual(plan({ githubRef: 'refs/tags/v0.4.4', tagInfo: tagInfo({ sha: head }) }), {
    release: true, tag: 'v0.4.4', sha: head,
  })
  for (const githubRef of ['refs/tags/v0.4.3', 'refs/tags/0.4.4', 'refs/tags/v0.4.4-extra']) {
    assert.throws(() => plan({ githubRef, tagInfo: tagInfo({ sha: head }) }), /Tag recovery requires GITHUB_REF/)
  }
  assert.throws(() => plan({ githubRef: 'refs/tags/v0.4.4' }), /existing annotated tag/)
  assert.throws(() => plan({ githubRef: 'refs/tags/v0.4.4', tagInfo: tagInfo(), files: ['README.md'] }), /point to HEAD/)
})

test('NUL-separated file lists preserve whitespace, tabs and newlines', () => {
  assert.deepEqual(parseChangedFiles('src/a b.ts\0docs/a\nb.md\0src/tab\tfile.ts\0'), [
    'src/a b.ts', 'docs/a\nb.md', 'src/tab\tfile.ts',
  ])
  assert.deepEqual(parseChangedFiles(''), [])
  assert.throws(() => parseChangedFiles('index.js\n'), /NUL-terminated/)
})

// Scripted Git responses assert every command and argv, with no fixture commits,
// tags, index writes, filesystem writes or network requests.
function cliFixture({ steps = [], committed = {}, env = {}, local = {} } = {}) {
  const pending = [...steps]
  const logs = []
  const outputs = []
  const files = { 'package.json': JSON.stringify(manifest), 'CHANGELOG.md': metadata('0.4.4').changelog, 'README.md': metadata('0.4.4').readme, ...committed }
  const committedReads = []
  return {
    run: args => runCli(args, {
      cwd: '.', env,
      git: argv => {
        if (argv.length === 2 && argv[0] === 'show' && argv[1].startsWith('HEAD:')) {
          const name = argv[1].slice('HEAD:'.length)
          committedReads.push(name)
          assert.ok(name in files, `Unexpected committed file read: ${name}`)
          return { status: 0, stdout: files[name] }
        }
        const next = pending.shift()
        assert.ok(next, `Unexpected git call: ${JSON.stringify(argv)}`)
        assert.deepEqual(argv, next[0])
        return typeof next[1] === 'object' ? next[1] : { status: 0, stdout: next[1] }
      },
      // Legacy injection is deliberately not consumed: only Git owns metadata.
      readText: path => { assert.fail(`Working-tree metadata must not be read: ${path}`); return local[path] },
      appendOutput: (path, text) => outputs.push({ path, text }),
      log: text => logs.push(JSON.parse(text)),
    }),
    done: () => assert.equal(pending.length, 0, 'all expected Git calls were consumed'),
    logs, outputs, committedReads,
  }
}
const baseSteps = (base, files = 'index.js\0') => [
  [['show', `${base}:package.json`], '{"version":"0.4.3"}'],
  [['diff', '--name-only', '-z', '--no-renames', base, 'HEAD', '--'], files],
]
const planSteps = ({ exists = false, sha = previous, type = 'tag', tagManifest = manifest, files = 'README.md\0', ancestor = true } = {}) => {
  const ref = 'refs/tags/v0.4.4'
  const steps = [
    [['rev-parse', '--verify', 'HEAD^{commit}'], `${head}\n`],
    [['show-ref', '--verify', '--quiet', ref], exists ? '' : { status: 1, stdout: '' }],
  ]
  if (exists) {
    steps.push([['cat-file', '-t', ref], `${type}\n`])
    if (type !== 'tag') return steps
    steps.push(
      [['rev-parse', '--verify', `${ref}^{commit}`], `${sha}\n`],
      [['show', `${ref}:package.json`], JSON.stringify(tagManifest)],
    )
    if (sha !== head) steps.push(
      [['merge-base', '--is-ancestor', sha, head], ancestor ? '' : { status: 1, stdout: '' }],
      [['diff', '--name-only', '-z', '--no-renames', sha, 'HEAD', '--'], files],
    )
  }
  return steps
}

test('CLI base uses the committed HEAD diff and never interpolates ref shell syntax', () => {
  for (const base of ['origin/main', 'refs/heads/topic;echo-owned']) {
    const fixture = cliFixture({ steps: baseSteps(base) })
    assert.deepEqual(fixture.run(['--base', base]), { important: true, bumped: true, version: '0.4.4' })
    fixture.done()
    assert.deepEqual(fixture.logs, [{ important: true, bumped: true, version: '0.4.4' }])
    assert.deepEqual(fixture.outputs, [])
  }
})

test('CLI ignores an uncommitted bump and validates committed release metadata only', () => {
  const local = {
    'package.json': JSON.stringify({ version: '0.4.5' }),
    'CHANGELOG.md': metadata('0.4.5').changelog,
    'README.md': metadata('0.4.5').readme,
  }
  const unchanged = cliFixture({
    steps: baseSteps('origin/main'), local,
    committed: { 'package.json': '{"version":"0.4.3"}' },
  })
  assert.throws(() => unchanged.run(['--base', 'origin/main']), /strictly greater/)
  unchanged.done()
  for (const [name, expected] of [['CHANGELOG.md', /CHANGELOG.md/], ['README.md', /README.md/]]) {
    const fixture = cliFixture({ steps: baseSteps('origin/main'), local, committed: { [name]: '' } })
    assert.throws(() => fixture.run(['--base', 'origin/main']), expected)
    fixture.done()
    assert.deepEqual(fixture.committedReads, ['package.json', 'CHANGELOG.md', 'README.md'])
  }
  const release = cliFixture({ steps: planSteps(), local })
  assert.equal(release.run(['--plan']).tag, 'v0.4.4', 'uncommitted 0.4.5 never changes the release version')
  assert.deepEqual(release.committedReads, ['package.json'])
  release.done()
})

test('CLI rejects malformed arguments and surfaces Git or manifest failures', () => {
  for (const args of [[], ['--base'], ['--plan', 'extra'], ['--unknown'], ['--base', 'HEAD', '--plan']]) {
    assert.throws(() => cliFixture().run(args), /Usage:/)
  }
  for (const base of ['', '--output=owned', 'HEAD\nother', 'HEAD\0other']) {
    assert.throws(() => cliFixture().run(['--base', base]), /non-option Git ref/)
  }
  const fixture = cliFixture({ steps: [[['show', 'missing:package.json'], { status: 128, stderr: 'invalid object name' }]] })
  assert.throws(() => fixture.run(['--base', 'missing']), /invalid object name.*fetched/)
  fixture.done()
  assert.throws(() => cliFixture({ committed: { 'package.json': '{' } }).run(['--plan']), /Cannot parse package.json/)
})

test('CLI plan emits owned JSON and appends all GitHub outputs', () => {
  for (const options of [{}, { exists: true, sha: head }, { exists: true }]) {
    const fixture = cliFixture({ steps: planSteps(options), env: { GITHUB_OUTPUT: 'output-file' } })
    const decision = fixture.run(['--plan'])
    fixture.done()
    assert.equal(decision.release, !options.exists || options.sha === head)
    assert.deepEqual(fixture.logs, [decision])
    assert.deepEqual(fixture.outputs, [{ path: 'output-file', text: `release=${decision.release}\ntag=v0.4.4\nsha=${head}\n` }])
  }
})

test('CLI plan rejects important unreleased changes, lightweight and mismatched tags', () => {
  for (const [options, expected] of [
    [{ exists: true, files: 'src/runtime.ts\0' }, /merged important changes lack a new version/],
    [{ exists: true, type: 'commit' }, /annotated tag/],
    [{ exists: true, sha: head, tagManifest: { version: '0.4.3' } }, /does not match/],
    [{ exists: true, ancestor: false }, /not an ancestor/],
  ]) {
    const fixture = cliFixture({ steps: planSteps(options), env: { GITHUB_OUTPUT: 'output-file' } })
    assert.throws(() => fixture.run(['--plan']), expected)
    fixture.done()
    assert.deepEqual(fixture.outputs, [])
    assert.deepEqual(fixture.logs, [])
  }
})

test('CLI honors recovery ref and distinguishes missing tag from Git failure', () => {
  const recovery = cliFixture({ steps: planSteps({ exists: true, sha: head }), env: { GITHUB_REF: 'refs/tags/v0.4.4' } })
  assert.equal(recovery.run(['--plan']).release, true)
  recovery.done()
  const missing = cliFixture({ steps: planSteps(), env: { GITHUB_REF: 'refs/tags/v0.4.4' } })
  assert.throws(() => missing.run(['--plan']), /existing annotated tag/)
  missing.done()
  const steps = planSteps()
  steps[1][1] = { status: 128, stderr: 'repository broken' }
  const broken = cliFixture({ steps })
  assert.throws(() => broken.run(['--plan']), /repository broken/)
  broken.done()
})
