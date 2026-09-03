// Compatibility contract for the controlled rc.2 baseline and official DSH rc.1.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const RC1_COMMIT = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
const DSH_RANGE = '>=0.1.1-rc.2 <0.1.2-0 || >=0.1.2-alpha.4 <0.1.2'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const requiredPeers = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-tools',
]
const optionalPeers = ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-web']

assert.equal(manifest.version, '0.4.1')
assert.equal(manifest.packageManager, 'pnpm@11.7.0')
assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0')
for (const name of [...requiredPeers, ...optionalPeers]) {
  assert.equal(manifest.peerDependencies[name], DSH_RANGE, `${name} must stay bounded below stable 0.1.2`)
}
for (const name of optionalPeers) assert.equal(manifest.peerDependenciesMeta[name]?.optional, true)
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout'))
assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
console.log('✓ package manifest targets controlled rc.2 and official rc.1')

function assertRc1SourceIdentity(commit, status) {
  assert.equal(commit, RC1_COMMIT, 'DSH source checkout must be the exact official rc.1 commit')
  assert.equal(status, '', 'DSH source checkout must have no tracked modifications')
}
assert.throws(() => assertRc1SourceIdentity('0'.repeat(40), ''), /exact official rc\.1 commit/)
assert.throws(() => assertRc1SourceIdentity(RC1_COMMIT, ' M package.json'), /no tracked modifications/)

const corePath = process.env.DSH_CORE_PATH?.trim()
if (!corePath) {
  console.log('ℹ DSH_CORE_PATH is unset; skipping Core source checks')
  process.exit(0)
}

const sourceSession = join(corePath, 'packages', 'core', 'session', 'src', 'index.ts')
const sourcePersistence = join(corePath, 'packages', 'session', 'session-persistence', 'src', 'index.ts')
const isSourceCheckout = existsSync(sourceSession) && existsSync(sourcePersistence)

if (isSourceCheckout) {
  const commit = execFileSync('git', ['-C', corePath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const status = execFileSync('git', ['-C', corePath, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()
  assertRc1SourceIdentity(commit, status)
  const cliManifest = JSON.parse(readFileSync(join(corePath, 'apps', 'cli', 'package.json'), 'utf8'))
  assert.equal(cliManifest.version, '0.1.2-rc.1')

  const liveSession = readFileSync(sourceSession, 'utf8')
  for (const method of ['eventAt(seq: SessionSeq)', 'snapshotEvents(', 'ownEvents(): readonly SessionEvent[]']) {
    assert.ok(liveSession.includes(method), `rc.1 live Session method is unavailable: ${method}`)
  }
  const persistence = readFileSync(sourcePersistence, 'utf8')
  assert.match(
    persistence,
    /interface SessionInspection[\s\S]*?readonly events: readonly SessionEvent\[\]/,
    'cold SessionInspection must retain its immutable events snapshot',
  )

  const toolRuntime = readFileSync(join(corePath, 'packages', 'core', 'tools', 'src', 'index.ts'), 'utf8')
  assert.match(toolRuntime, /interface ToolExecutionInput[\s\S]*?readonly agent\?: Agent/)
  for (const packagePath of [
    ['packages', 'core', 'agent', 'package.json'],
    ['packages', 'core', 'session', 'package.json'],
    ['packages', 'host', 'webserver', 'package.json'],
    ['packages', 'web', 'web', 'package.json'],
  ]) {
    const packageManifest = JSON.parse(readFileSync(join(corePath, ...packagePath), 'utf8'))
    assert.equal(packageManifest.version, '0.1.2-rc.1', `${packageManifest.name} is not rc.1`)
  }
  const clientPackages = new Map([
    ['@deepseek-ai/dsh-client-locale', ['packages', 'client', 'locale', 'package.json']],
    ['@deepseek-ai/dsh-client-ui-conversation', ['packages', 'client', 'ui-conversation', 'package.json']],
    ['@deepseek-ai/dsh-client-ui-layout', ['packages', 'client', 'ui-layout', 'package.json']],
  ])
  for (const clientPackage of manifest.dsh.client.inject) {
    const packagePath = clientPackages.get(clientPackage)
    assert.ok(packagePath && existsSync(join(corePath, ...packagePath)), `${clientPackage} is unavailable in rc.1 source`)
  }
  console.log(`✓ official DSH rc.1 source ${commit} exposes live Session methods, retained inspection events, ToolRunContext agent ownership, optional Web peers, and client packages`)
  process.exit(0)
}

const scope = join(corePath, 'node_modules', '@deepseek-ai')
const packageFile = (name, relative = 'lib/index.js') => join(scope, name, relative)
const importPackage = async (name) => import(pathToFileURL(packageFile(name)).href)
const dshManifestPath = packageFile('dsh', 'package.json')
assert.ok(existsSync(dshManifestPath), `DSH package not found under ${corePath}`)
const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8'))
assert.match(dshManifest.version, /^(?:0\.1\.1-rc\.2|0\.1\.2-rc\.1)$/)

const [{ AgentRegistry }, { AgentPresets }, { AgentDefaultModelConfig }, { JsonlSessionPersistence }] = await Promise.all([
  importPackage('dsh-agent'),
  importPackage('dsh-agent-presets'),
  importPackage('dsh-agent-default-model'),
  importPackage('dsh-session-persistence-jsonl'),
])
for (const [owner, method] of [
  [AgentRegistry, 'resume'],
  [AgentRegistry, 'roots'],
  [AgentPresets, 'mount'],
  [AgentDefaultModelConfig, 'currentSelection'],
  [JsonlSessionPersistence, 'list'],
  [JsonlSessionPersistence, 'inspect'],
]) {
  assert.equal(typeof owner?.prototype?.[method], 'function', `${owner?.name ?? 'service'}.${method} is unavailable`)
}
console.log(`✓ installed Core ${dshManifest.version} exposes retained dsh-cron service APIs`)
