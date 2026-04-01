// One-click apply: replace SALT in companion.ts and optionally rebuild

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const CC_SOURCE_DEFAULT = join(
  process.env.HOME ?? '~',
  'Developer',
  'claude-code-source-code'
)

const COMPANION_PATH = 'src/buddy/companion.ts'
const SALT_REGEX = /const SALT = '([^']+)'/

export function getCurrentSalt(ccSourcePath?: string): string {
  const base = ccSourcePath ?? CC_SOURCE_DEFAULT
  const filePath = join(base, COMPANION_PATH)
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(SALT_REGEX)
  if (!match) throw new Error(`Could not find SALT in ${filePath}`)
  return match[1]!
}

export function applySalt(newSalt: string, ccSourcePath?: string): { oldSalt: string; filePath: string } {
  const base = ccSourcePath ?? CC_SOURCE_DEFAULT
  const filePath = join(base, COMPANION_PATH)
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(SALT_REGEX)
  if (!match) throw new Error(`Could not find SALT in ${filePath}`)

  const oldSalt = match[1]!
  const newContent = content.replace(SALT_REGEX, `const SALT = '${newSalt}'`)
  writeFileSync(filePath, newContent, 'utf-8')

  return { oldSalt, filePath }
}

export function rebuild(ccSourcePath?: string): string {
  const base = ccSourcePath ?? CC_SOURCE_DEFAULT
  try {
    const output = execSync('npm run build', {
      cwd: base,
      encoding: 'utf-8',
      timeout: 120_000,
    })
    return output
  } catch (err) {
    throw new Error(
      `Build failed: ${err instanceof Error ? err.message : err}`
    )
  }
}
