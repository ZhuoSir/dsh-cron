import { defineConfig } from 'tsdown'

// The client half ships as ONE CJS bundle wrapped by scripts/wrap-client.mjs
// into the window.__ModuleLoader__.load({ id, factory }) format the web shell
// serves at /plugins/dsh-cron/client.js. Everything the shell module table
// provides stays external so the factory's `require` resolves against it.
export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  format: ['cjs'],
  platform: 'browser',
  outDir: 'lib',
  minify: false,
  sourcemap: false,
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    /^@deepseek-ai\//,
  ],
})
