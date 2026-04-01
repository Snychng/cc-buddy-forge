// Replace SALT in the installed Claude Code binary

import { readFileSync, writeFileSync, existsSync, realpathSync, readdirSync, statSync } from 'fs'
import { execSync, execFileSync } from 'child_process'
import { basename, dirname, join, resolve } from 'path'
import { homedir } from 'os'

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

function detectSaltFromBytes(buf: Buffer): { salt: string; length: number } | null {
  const patterns = [
    /friend-\d{4}-\d+/,
    /ccbf-\d{10}/,
  ]

  const str = buf.toString('ascii')
  for (const pattern of patterns) {
    const match = str.match(pattern)
    if (match) {
      return { salt: match[0], length: match[0].length }
    }
  }

  return null
}

function detectSaltFromFile(filePath: string): { salt: string; length: number } | null {
  if (!existsSync(filePath)) return null
  return detectSaltFromBytes(readFileSync(filePath))
}

function normalizeExistingPath(filePath: string): string | null {
  try {
    return realpathSync(filePath)
  } catch {
    return existsSync(filePath) ? resolve(filePath) : null
  }
}

function collectCommandCandidates(command: string): string[] {
  try {
    const out = execSync(command, { encoding: 'utf-8' }).trim()
    if (!out) return []

    return out
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(normalizeExistingPath)
      .filter((line): line is string => Boolean(line))
  } catch {
    return []
  }
}

function scanClaudeBinaries(rootDir: string, depth = 2): string[] {
  const root = normalizeExistingPath(rootDir)
  if (!root) return []

  let stats
  try {
    stats = statSync(root)
  } catch {
    return []
  }

  if (stats.isFile()) {
    const name = basename(root).toLowerCase()
    return name === 'claude' || name === 'claude.exe' ? [root] : []
  }

  if (!stats.isDirectory() || depth < 0) return []

  const results: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...scanClaudeBinaries(entryPath, depth - 1))
      continue
    }

    const name = entry.name.toLowerCase()
    if (name === 'claude' || name === 'claude.exe') {
      const normalized = normalizeExistingPath(entryPath)
      if (normalized) results.push(normalized)
    }
  }

  return results
}

function uniquePaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (const path of paths) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    results.push(path)
  }

  return results
}

function getClaudeCandidatePaths(seedPath?: string): string[] {
  const home = homedir()
  const explicit = seedPath ? [normalizeExistingPath(seedPath)] : []
  const commandCandidates = seedPath
    ? []
    : process.platform === 'win32'
      ? uniquePaths([
          ...collectCommandCandidates('where claude'),
          ...collectCommandCandidates('where claude.exe'),
        ])
      : collectCommandCandidates('which claude')

  const nearbyCandidates = uniquePaths([
    ...explicit,
    ...explicit.flatMap(path => path ? [
      normalizeExistingPath(join(dirname(path), 'claude')),
      normalizeExistingPath(join(dirname(path), 'claude.exe')),
      normalizeExistingPath(join(dirname(path), '.local', 'share', 'claude', 'versions')),
    ] : []),
  ])

  const commonInstallCandidates = uniquePaths([
    normalizeExistingPath(join(home, '.local', 'bin', 'claude')),
    normalizeExistingPath(join(home, '.local', 'bin', 'claude.exe')),
    normalizeExistingPath(join(home, '.claude', 'local', 'claude')),
    normalizeExistingPath(join(home, '.claude', 'local', 'claude.exe')),
  ])

  const scannedInstallCandidates = uniquePaths([
    ...scanClaudeBinaries(join(home, '.local', 'share', 'claude', 'versions')),
    ...scanClaudeBinaries(join(home, '.claude', 'local')),
    ...nearbyCandidates.flatMap(path => scanClaudeBinaries(path)),
  ])

  return uniquePaths([
    ...explicit,
    ...commandCandidates,
    ...nearbyCandidates,
    ...commonInstallCandidates,
    ...scannedInstallCandidates,
  ])
}

/** Resolve the claude binary path (follows symlinks) */
export function findClaudeBinary(): string | null {
  const candidates = getClaudeCandidatePaths()
  for (const candidate of candidates) {
    if (detectSaltFromFile(candidate)) return candidate
  }

  return candidates[0] ?? null
}

/** Resolve a provided binary path to a stable real path */
export function resolveBinaryPath(binaryPath?: string): string | null {
  const candidates = getClaudeCandidatePaths(binaryPath)
  for (const candidate of candidates) {
    if (detectSaltFromFile(candidate)) return candidate
  }

  return candidates[0] ?? null
}

/**
 * Detect the current salt from the Claude Code binary.
 * Searches for known salt patterns: "friend-XXXX-XXX" or "ccbf-XXXXXXXXXX".
 * Returns the salt string and its byte length.
 */
export function detectBinarySalt(binaryPath?: string): { salt: string; length: number } | null {
  const filePath = resolveBinaryPath(binaryPath)
  if (!filePath || !existsSync(filePath)) return null

  return detectSaltFromFile(filePath)
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
  const filePath = resolveBinaryPath(binaryPath)
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
  originalSalt: string,
  binaryPath?: string
): { filePath: string; patchCount: number; restoredSalt: string; previousSalt: string } {
  const filePath = resolveBinaryPath(binaryPath)
  if (!filePath) throw new Error('Could not find claude binary.')
  if (!existsSync(filePath)) throw new Error(`Binary not found: ${filePath}`)

  const detected = detectBinarySalt(filePath)
  if (!detected) {
    throw new Error('Could not detect the current salt in binary. The binary format may have changed.')
  }

  if (detected.salt === originalSalt) {
    return { filePath, patchCount: 0, restoredSalt: originalSalt, previousSalt: detected.salt }
  }

  if (detected.length !== originalSalt.length) {
    throw new Error(
      `Recorded original salt "${originalSalt}" is ${originalSalt.length} chars, ` +
      `but current binary salt "${detected.salt}" is ${detected.length} chars.`
    )
  }

  const buf = readFileSync(filePath)
  const searchBytes = Buffer.from(detected.salt, 'utf-8')
  const restoreBytes = Buffer.from(originalSalt, 'utf-8')

  const offsets: number[] = []
  let pos = 0
  while (true) {
    const idx = buf.indexOf(searchBytes, pos)
    if (idx === -1) break
    offsets.push(idx)
    pos = idx + 1
  }

  if (offsets.length === 0) {
    throw new Error(`Could not find "${detected.salt}" in binary.`)
  }

  for (const offset of offsets) {
    restoreBytes.copy(buf, offset)
  }

  writeFileSync(filePath, buf)
  resignBinaryIfNeeded(filePath)
  return { filePath, patchCount: offsets.length, restoredSalt: originalSalt, previousSalt: detected.salt }
}
