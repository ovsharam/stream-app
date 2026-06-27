#!/usr/bin/env node
/**
 * Builds Notch UI + Electron + bundled API for electron-builder.
 * Output: release/server/ (extraResources), notch/dist-renderer/, notch/dist-electron/
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const serverOut = join(root, 'release/server')

function run(cmd, env = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
}

function copyNativeModule(name) {
  const src = join(root, 'node_modules', name)
  const dest = join(serverOut, 'node_modules', name)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
}

console.log('\n[release] Building Notch UI + Electron…')
run('npm run build:notch')

console.log('\n[release] Bundling API server…')
rmSync(serverOut, { recursive: true, force: true })
mkdirSync(serverOut, { recursive: true })

await esbuild.build({
  entryPoints: [join(root, 'server/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: join(serverOut, 'index.js'),
  external: ['better-sqlite3', 'falkordb', '@cursor/sdk'],
  logLevel: 'info',
  sourcemap: true,
  alias: {
    '@shared': join(root, 'shared')
  }
})

mkdirSync(join(serverOut, 'node_modules'), { recursive: true })
copyNativeModule('better-sqlite3')
copyNativeModule('bindings')
copyNativeModule('file-uri-to-path')
copyNativeModule('@cursor/sdk')

writeFileSync(
  join(serverOut, 'package.json'),
  JSON.stringify({ name: 'notch-server', private: true, type: 'commonjs' }, null, 2)
)

const configSrc = join(root, 'config/kb-ontology.json')
if (existsSync(configSrc)) {
  mkdirSync(join(serverOut, 'config'), { recursive: true })
  cpSync(configSrc, join(serverOut, 'config/kb-ontology.json'))
}

console.log('\n[release] Ready for electron-builder (release/server + notch/dist-*).')
