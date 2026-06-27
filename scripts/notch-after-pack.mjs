#!/usr/bin/env node
/**
 * electron-builder afterPack — copy bundled API (incl. native node_modules) into .app.
 * extraResources alone omits node_modules from release/server.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** @param {import('app-builder-lib').AfterPackContext} context */
export default async function afterPack(context) {
  const projectDir = context.packager.projectDir
  const src = join(projectDir, 'release/server')
  const entry = join(src, 'index.js')
  if (!existsSync(entry)) {
    throw new Error(
      'release/server/index.js missing — run npm run prepare:notch-release before pack:notch:mac'
    )
  }

  const appName = `${context.packager.appInfo.productFilename}.app`
  const dest = join(context.appOutDir, appName, 'Contents/Resources/server')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
  console.log(`[release] Copied bundled API → ${dest}`)
}
