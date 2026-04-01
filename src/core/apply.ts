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

/** Known default salt — used as fallback when binary detection fails */
export const FALLBACK_SALT = 'friend-2026-401'

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
 * Detect the current salt from the Claude Code binary.
 * Searches for known salt patterns: "friend-XXXX-XXX" or "ccbf-XXXXXXXXXX".
 * Returns the salt string and its byte length.
 */
export function detectBinarySalt(binaryPath?: string): { salt: string; length: number } | null {
  const filePath = binaryPath ?? findClaudeBinary()
  if (!filePath || !existsSync(filePath)) return null

  const buf = readFileSync(filePath)

  // Try known patterns in order: original salt format, then ccbf format
  const patterns = [
    /friend-\d{4}-\d+/,  // original: friend-2026-401
    /ccbf-\d{10}/,        // our format: ccbf-0000000088
  ]

  for (const pattern of patterns) {
    // Search in the binary as a string (only ASCII portions matter)
    const str = buf.toString('ascii')
    const match = str.match(pattern)
    if (match) {
      return { salt: match[0], length: match[0].length }
    }
  }

  return null
}

/**
 * Patch the compiled binary in-place.
 *
 * Automatically detects the current salt in the binary and validates
 * that the new salt is exactly the same length for safe byte-for-byte
 * replacement.
 */
export function applyBinary(
  newSalt: string,
  binaryPath?: string
): { oldSalt: string; filePath: string; patchCount: number } {
  const filePath = binaryPath ?? findClaudeBinary()
  if (!filePath) {
    throw new Error('Could not find claude binary. Use --binary <path> or install Claude Code first.')
  }
  if (!existsSync(filePath)) {
    throw new Error(`Binary not found: ${filePath}`)
  }

  const detected = detectBinarySalt(filePath)
  if (!detected) {
    throw new Error('Could not detect salt in binary. The binary format may have changed.')
  }

  if (newSalt.length !== detected.length) {
    throw new Error(
      `Salt "${newSalt}" is ${newSalt.length} chars, but the current salt "${detected.salt}" is ${detected.length} chars. ` +
      `They must be the same length for binary patching.`
    )
  }

  const buf = readFileSync(filePath)
  const oldBytes = Buffer.from(detected.salt, 'utf-8')
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
    throw new Error(`Could not find "${detected.salt}" in binary bytes.`)
  }

  for (const offset of offsets) {
    newBytes.copy(buf, offset)
  }

  writeFileSync(filePath, buf)
  return { oldSalt: detected.salt, filePath, patchCount: offsets.length }
}

/** Restore binary to original salt */
export function restoreBinary(
  currentSalt: string,
  binaryPath?: string
): { filePath: string; patchCount: number; restoredSalt: string } {
  const filePath = binaryPath ?? findClaudeBinary()
  if (!filePath) throw new Error('Could not find claude binary.')
  if (!existsSync(filePath)) throw new Error(`Binary not found: ${filePath}`)

  const buf = readFileSync(filePath)
  const searchBytes = Buffer.from(currentSalt, 'utf-8')

  // Restore to FALLBACK_SALT, padded/truncated to match length
  const targetSalt = FALLBACK_SALT.length === currentSalt.length
    ? FALLBACK_SALT
    : FALLBACK_SALT.padEnd(currentSalt.length, '0').slice(0, currentSalt.length)
  const restoreBytes = Buffer.from(targetSalt, 'utf-8')

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
  return { filePath, patchCount: offsets.length, restoredSalt: targetSalt }
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
