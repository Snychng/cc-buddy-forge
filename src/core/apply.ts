// One-click apply: replace SALT in source or binary

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const CC_SOURCE_DEFAULT = join(
  process.env.HOME ?? '~',
  'Developer',
  'claude-code-source-code'
)

const COMPANION_PATH = 'src/buddy/companion.ts'
const SALT_REGEX = /const SALT = '([^']+)'/

export const ORIGINAL_SALT = 'friend-2026-401'
const ORIGINAL_SALT_LEN = ORIGINAL_SALT.length // 15

// ── Binary (installed via install.sh) ──

/** Resolve the claude binary path (follows symlinks) */
export function findClaudeBinary(): string | null {
  try {
    const out = execSync('which claude', { encoding: 'utf-8' }).trim()
    if (!out) return null
    const resolved = execSync(`realpath "${out}"`, { encoding: 'utf-8' }).trim()
    return resolved
  } catch {
    return null
  }
}

/**
 * Patch the compiled binary in-place.
 *
 * The binary contains the salt in JS string literals and a data segment.
 * New salt MUST be exactly 15 chars (same as original) to avoid corrupting
 * the binary structure. No null-padding — byte-for-byte replacement only.
 */
export function applyBinary(
  newSalt: string,
  binaryPath?: string
): { oldSalt: string; filePath: string; patchCount: number } {
  if (newSalt.length !== ORIGINAL_SALT_LEN) {
    throw new Error(
      `Salt "${newSalt}" is ${newSalt.length} chars, but binary patching requires exactly ${ORIGINAL_SALT_LEN} chars. ` +
      `Use "ccbf search --compact" to find compatible salts.`
    )
  }

  const filePath = binaryPath ?? findClaudeBinary()
  if (!filePath) {
    throw new Error('Could not find claude binary. Use --binary <path> or install Claude Code first.')
  }
  if (!existsSync(filePath)) {
    throw new Error(`Binary not found: ${filePath}`)
  }

  const buf = readFileSync(filePath)

  // Search pattern: the original salt as bytes
  const oldBytes = Buffer.from(ORIGINAL_SALT, 'utf-8')
  const newBytes = Buffer.from(newSalt, 'utf-8')

  const offsets: number[] = []
  let pos = 0
  while (true) {
    const idx = buf.indexOf(oldBytes, pos)
    if (idx === -1) break
    offsets.push(idx)
    pos = idx + 1
  }

  if (offsets.length === 0) {
    throw new Error(
      `Could not find "${ORIGINAL_SALT}" in binary. It may have been patched already or the binary format changed.`
    )
  }

  for (const offset of offsets) {
    // Exact same length — byte-for-byte replacement, no padding needed
    newBytes.copy(buf, offset)
  }

  writeFileSync(filePath, buf)
  return { oldSalt: ORIGINAL_SALT, filePath, patchCount: offsets.length }
}

/** Restore binary to original salt */
export function restoreBinary(
  currentSalt: string,
  binaryPath?: string
): { filePath: string; patchCount: number } {
  const filePath = binaryPath ?? findClaudeBinary()
  if (!filePath) throw new Error('Could not find claude binary.')
  if (!existsSync(filePath)) throw new Error(`Binary not found: ${filePath}`)

  const buf = readFileSync(filePath)
  const searchBytes = Buffer.from(currentSalt, 'utf-8')
  const restoreBytes = Buffer.from(ORIGINAL_SALT, 'utf-8')

  const offsets: number[] = []
  let pos = 0
  while (true) {
    const idx = buf.indexOf(searchBytes, pos)
    if (idx === -1) break
    offsets.push(idx)
    pos = idx + 1
  }

  if (offsets.length === 0) {
    throw new Error(`Could not find "${currentSalt}" in binary.`)
  }

  for (const offset of offsets) {
    restoreBytes.copy(buf, offset)
  }

  writeFileSync(filePath, buf)
  return { filePath, patchCount: offsets.length }
}

// ── Source (from git clone) ──

export function getCurrentSalt(ccSourcePath?: string): string {
  const base = ccSourcePath ?? CC_SOURCE_DEFAULT
  const filePath = join(base, COMPANION_PATH)
  const content = readFileSync(filePath, 'utf-8')
  const match = content.match(SALT_REGEX)
  if (!match) throw new Error(`Could not find SALT in ${filePath}`)
  return match[1]!
}

export function applySalt(
  newSalt: string,
  ccSourcePath?: string
): { oldSalt: string; filePath: string } {
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
