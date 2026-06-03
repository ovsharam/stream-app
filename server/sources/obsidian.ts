import { appendFile, mkdir } from 'fs/promises'
import { dirname, join, normalize, resolve } from 'path'
import { resolveObsidianNotePath } from '../../shared/capture'

function assertInsideVault(vaultPath: string, targetPath: string): void {
  const root = resolve(vaultPath)
  const target = resolve(targetPath)
  if (!target.startsWith(root + '/') && target !== root) {
    throw new Error('Note path must stay inside the Obsidian vault')
  }
}

export async function appendObsidianNote(input: {
  vaultPath: string
  notePath: string
  text: string
  heading?: string
}): Promise<{ path: string }> {
  const vault = input.vaultPath.trim()
  if (!vault) throw new Error('Obsidian vault path is not configured')

  const relative = resolveObsidianNotePath(input.notePath.trim())
  const filePath = normalize(join(vault, relative))
  assertInsideVault(vault, filePath)

  await mkdir(dirname(filePath), { recursive: true })

  const stamp = new Date().toLocaleString()
  const block = input.heading
    ? `\n\n## ${input.heading}\n_${stamp}_\n\n${input.text.trim()}\n`
    : `\n\n---\n_${stamp}_\n\n${input.text.trim()}\n`

  await appendFile(filePath, block, 'utf8')
  return { path: filePath }
}
