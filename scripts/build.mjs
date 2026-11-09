/**
 * Build the merged DSH bundle.
 *
 * Three artifacts, one package:
 *   lib/opencode-go/index.js  — OpenCode Go host engine (route, accounts, usage,
 *                               analytics) as an ESM host bundle
 *   lib/protocom/index.js     — Protocom / Command Code / ClinePass host engine
 *   lib/client.js             — one browser module containing both settings UIs
 *
 * Both host bundles keep the DSH service identities (`@deepseek-ai/*`) and the
 * vendor SDKs external, exactly as the engines did on their own, so a profile
 * resolves one copy of every runtime service.
 */
import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'
import { googleFetchEsbuildPlugin } from './google-fetch-bridge.mjs'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const output = 'lib'

// The two engines live as sibling checkouts during development; their installed
// dependencies are the union this package needs. A published install resolves
// them from the package's own node_modules instead.
const NODE_PATHS = [
  resolve('..', 'dsh-opencode-go-main', 'node_modules'),
  resolve('..', 'dsh-protocom-api-main', 'node_modules'),
]

const HOST_EXTERNALS = ['@deepseek-ai/*', 'undici', 'openai', '@anthropic-ai/sdk']
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Serve `*.module.css` as a hashed class map, injected once per module id. */
const cssPlugin = {
  name: 'plugin-css-modules',
  setup(build) {
    build.onResolve({ filter: /\.module\.css$/ }, args => ({
      path: relative(process.cwd(), resolve(args.resolveDir, args.path)).split(sep).join('/'),
      namespace: 'plugin-css',
    }))
    build.onLoad({ filter: /.*/, namespace: 'plugin-css' }, async args => {
      const result = transform({
        filename: args.path,
        code: await readFile(args.path),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes = Object.fromEntries(Object.entries(result.exports).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, value]) => [key, [value.name, ...value.composes.map(item => {
          if (item.type === 'dependency') throw new Error(`External CSS composition is unsupported: ${item.name}`)
          return item.name
        })].join(' ')]))
      const id = JSON.stringify(`${pkg.name}/${args.path.split('/').pop()}`)
      return {
        loader: 'js',
        contents: `const id = ${id};`
          + ` if (!document.querySelector('style[data-plugin-css=' + JSON.stringify(id) + ']')) {`
          + ` const style = document.createElement('style');`
          + ` style.dataset.plugin = ${JSON.stringify(pkg.name)};`
          + ` style.dataset.pluginCss = id;`
          + ` style.textContent = ${JSON.stringify(result.code.toString())};`
          + ` document.head.appendChild(style); }`
          + ` export default ${JSON.stringify(classes)};`,
      }
    })
  },
}

for (const face of ['opencode-go', 'protocom']) {
  await build({
    entryPoints: [`src/engines/${face}/index.ts`],
    outfile: join(output, face, 'index.js'),
    bundle: true,
    external: HOST_EXTERNALS,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    nodePaths: NODE_PATHS,
    plugins: face === 'opencode-go' ? [googleFetchEsbuildPlugin()] : [],
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; var require = __createRequire(import.meta.url);",
    },
  })
  console.log(`host bundle: lib/${face}/index.js`)
}

// Standalone Bun executes only the OpenCode Free HTTP worker.
await build({
  entryPoints: ['src/engines/opencode-go/free-http-worker.ts'],
  outfile: join(output, 'free-http-worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  nodePaths: NODE_PATHS,
})
console.log('worker: lib/free-http-worker.js')

const client = await build({
  entryPoints: ['src/client/index.ts'],
  outfile: join(output, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  nodePaths: NODE_PATHS,
  external: CLIENT_EXTERNALS,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [cssPlugin],
  metafile: true,
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
})
for (const artifact of Object.values(client.metafile.outputs)) {
  for (const item of artifact.imports) {
    if (item.external && !CLIENT_EXTERNALS.includes(item.path)) {
      throw new Error(`Unsupported DSH client external: ${item.path}`)
    }
  }
}
console.log('client bundle: lib/client.js')
await writeFile(join(output, 'build-info.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version, hostExternals: HOST_EXTERNALS, clientExternals: CLIENT_EXTERNALS }, null, 2) + '\n')
