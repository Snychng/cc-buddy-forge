// Replace SALT in the installed Claude Code binary

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync, execFileSync } from 'child_process'

/** Known default salt — used as fallback when binary detection fails */
export const FALLBACK_SALT = 'friend-2026-401'

// ── Binary (installed via install.sh) ──

/**
 * macOS 会在可执行文件字节被修改后判定签名失效。
 * 这里在修补完成后做一次 ad-hoc 重签名，避免 Claude Code 启动时被系统直接 SIGKILL。
 */
function resignBinaryIfNeeded(filePath: string): void {
  if (process.platform !== 'darwin') return

  try {
    execFileSync('codesign', ['--force', '--sign', '-', filePath], {
      stdio: 'pipe',
    })
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Binary patch succeeded, but macOS ad-hoc signing failed for ${filePath}. ` +
      `Run "codesign --force --sign - ${filePath}" manually. Details: ${details}`
    )
  }
}

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
  resignBinaryIfNeeded(filePath)
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
  resignBinaryIfNeeded(filePath)
  return { filePath, patchCount: offsets.length, restoredSalt: targetSalt }
}
