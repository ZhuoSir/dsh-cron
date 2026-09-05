import { defineConfig } from 'tsdown'

/**
 * Build and watch share the same output contract: tsdown writes the complete
 * ModuleLoader closure directly, so no post-build wrapper can be skipped by a
 * watch rebuild.
 */
const externals = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])
const isExternal = (specifier: string): boolean => externals.has(specifier) || specifier.startsWith('@deepseek-ai/')

export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  outDir: 'lib',
  clean: false,
  minify: false,
  sourcemap: false,
  deps: {
    neverBundle: isExternal,
    alwaysBundle: specifier => !isExternal(specifier),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-cron", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
