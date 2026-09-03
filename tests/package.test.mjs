import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(manifest.scripts.build, 'tsdown')
assert.equal(manifest.scripts.watch, 'tsdown --watch')
const clientPath = join(root, 'lib', 'client.js')
const client = readFileSync(clientPath, 'utf8')
assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
assert.match(client, /^window\.__ModuleLoader__\.load\(\{ id: "dsh-cron", factory: \(require\) => \{/)
assert.match(client, /return module\.exports; \} \}\);\s*$/)

const releaseWorkflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8').replaceAll('\r\n', '\n')
for (const marker of [
  "tags:\n      - 'v*'",
  'a66e4702047846cdaa10c66c9d3df3951f5ea70d',
  'git cat-file -t "refs/tags/$GITHUB_REF_NAME"',
  'pnpm install --frozen-lockfile',
  'pnpm verify',
  'pnpm pack --pack-destination artifacts',
  'sha256sum -- *.tgz > SHA256SUMS',
  'sha256sum --check SHA256SUMS',
  'gh release create "$GITHUB_REF_NAME" artifacts/*.tgz artifacts/SHA256SUMS',
]) assert.ok(releaseWorkflow.includes(marker), `release workflow omits ${marker}`)

function filesUnder(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = join(path, entry.name)
    return entry.isDirectory() ? filesUnder(target) : [target]
  })
}

const buildInputs = [
  ...filesUnder(join(root, 'src', 'client')),
  join(root, 'tsdown.config.ts'),
  join(root, 'package.json'),
]
const newestInput = Math.max(...buildInputs.map((path) => statSync(path).mtimeMs))
assert.ok(statSync(clientPath).mtimeMs >= newestInput, 'lib/client.js is stale; run pnpm build')

const output = mkdtempSync(join(tmpdir(), 'dsh-cron-pack-'))
try {
  const pnpmCli = process.env.npm_execpath
  assert.ok(pnpmCli, 'verify:package must run through pnpm')
  execFileSync(process.execPath, [pnpmCli, 'pack', '--pack-destination', output], {
    cwd: root,
    stdio: 'inherit',
  })
  const tarball = readdirSync(output).find((name) => name === 'dsh-cron-0.4.0.tgz')
  assert.equal(tarball, 'dsh-cron-0.4.0.tgz')
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar'
  const listing = execFileSync(tar, ['-tf', join(output, tarball)], { encoding: 'utf8' })
  for (const required of [
    'package/index.js',
    'package/lib/client.js',
    'package/cordis.patch.yml',
    'package/README.md',
    'package/CHANGELOG.md',
    'package/RELEASE.md',
    'package/package.json',
  ]) assert.ok(listing.split(/\r?\n/).includes(required), `packed artifact omits ${required}`)
  assert.ok(!listing.includes('package/src/'), 'packed artifact must not contain client source')
  assert.ok(!listing.includes('package/scripts/'), 'packed artifact must not contain build scripts')
} finally {
  rmSync(output, { recursive: true, force: true })
}

console.log('✓ client artifact is fresh, directly ModuleLoader-wrapped, and packable')
