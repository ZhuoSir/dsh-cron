// Compatibility contract for the DSH 0.1.2 alpha line.
//
// Static manifest checks always run. Set DSH_CORE_PATH to a built/installed DSH
// root (the directory containing node_modules/@deepseek-ai) to exercise the
// actual host services and client slot catalog used by this plugin.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const requiredPeers = [
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-tools',
]

assert.equal(manifest.version, '0.3.3')
for (const name of requiredPeers) {
  assert.equal(
    manifest.peerDependencies[name],
    '^0.1.1-rc.2 || >=0.1.2-alpha.4 <0.1.2',
    `${name} must admit alpha.4/alpha.5 without claiming unverified stable 0.1.2`,
  )
}
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout'))
assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'))
console.log('✓ package manifest targets the verified DSH 0.1.2 alpha boundary')

const corePath = process.env.DSH_CORE_PATH
if (!corePath) {
  console.log('ℹ DSH_CORE_PATH is unset; skipping installed-Core API checks')
  process.exit(0)
}

const scope = join(corePath, 'node_modules', '@deepseek-ai')
const packageFile = (name, relative = 'lib/index.js') => join(scope, name, relative)
const importPackage = async (name) => import(pathToFileURL(packageFile(name)).href)

const dshManifestPath = packageFile('dsh', 'package.json')
assert.ok(existsSync(dshManifestPath), `DSH package not found under ${corePath}`)
const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8'))
assert.match(dshManifest.version, /^0\.1\.2-alpha\.(4|5)$/, `unsupported Core under test: ${dshManifest.version}`)

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

for (const clientPackage of manifest.dsh.client.inject) {
  assert.ok(existsSync(packageFile(clientPackage.replace('@deepseek-ai/', ''), 'package.json')), `${clientPackage} is unavailable in Core`)
}

const sessionRuntime = readFileSync(packageFile('dsh-session'), 'utf8')
for (const eventType of ['user/message', 'assistant/message', 'request/header', 'turn/end', 'agent-preset/selected']) {
  assert.ok(sessionRuntime.includes(`"${eventType}"`), `session event ${eventType} is unavailable`)
}

const clientRunnerPath = packageFile('dsh-cordis-client-runner', 'lib/client.js')
assert.ok(existsSync(clientRunnerPath), 'dsh-cordis-client-runner client bundle is unavailable')
const clientRunner = readFileSync(clientRunnerPath, 'utf8')
for (const slotName of ['conversation.session.header.utilities', 'shell.overlay']) {
  assert.ok(clientRunner.includes(slotName), `client slot ${slotName} is unavailable`)
}

console.log(`✓ installed Core ${dshManifest.version} exposes every dsh-cron host and client contract`)
