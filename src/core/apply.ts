// Replace SALT in the installed Claude Code binary

import { readFileSync, writeFileSync, existsSync, realpathSync, readdirSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'path'
import { homedir } from 'os'

/** Known default salt — used as fallback when binary detection fails */
export const FALLBACK_SALT = 'friend-2026-401'

export type ClaudeInstallMethod =
  | 'native'
  | 'npm-global'
  | 'npm-local'
  | 'wrapper'
  | 'unknown'

export type ClaudeSaltDetection = {
  salt: string
  length: number
}

export type ClaudeCandidateInspection = {
  path: string
  installMethod: ClaudeInstallMethod
  detectedSalt: ClaudeSaltDetection | null
}

export type ClaudeInstallationInspection = {
  resolvedPath: string | null
  installMethod: ClaudeInstallMethod | null
  detectedSalt: ClaudeSaltDetection | null
  candidates: ClaudeCandidateInspection[]
}

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
  try {
    if (!statSync(filePath).isFile()) return null
  } catch {
    return null
  }
  return detectSaltFromBytes(readFileSync(filePath))
}

function isRegularFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

function normalizeExistingPath(filePath: string): string | null {
  try {
    return realpathSync(filePath)
  } catch {
    return existsSync(filePath) ? resolve(filePath) : null
  }
}

function collectPathCommandCandidates(): string[] {
  const pathEnv = process.env.PATH ?? ''
  const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':').filter(Boolean)
  const commandNames = process.platform === 'win32'
    ? ['claude.exe', 'claude.cmd', 'claude.bat', 'claude.ps1', 'claude']
    : ['claude']

  const candidates: Array<string | null> = []
  for (const dir of pathDirs) {
    for (const name of commandNames) {
      candidates.push(normalizeExistingPath(join(dir, name)))
    }
  }

  return uniquePaths(candidates)
}

function looksLikeClaudeBinaryCandidate(filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  const ext = extname(name)
  return (
    name === 'claude' ||
    name === 'claude.exe' ||
    name === 'ccode' ||
    name === 'ccode.exe' ||
    ext === '.exe' ||
    ext === '.js' ||
    ext === '.cjs' ||
    ext === '.mjs'
  )
}

function scanForSaltFiles(rootPath: string, depth = 3): string[] {
  const root = normalizeExistingPath(rootPath)
  if (!root) return []

  let stats
  try {
    stats = statSync(root)
  } catch {
    return []
  }

  if (stats.isFile()) {
    if (stats.size > 80 * 1024 * 1024) return []
    return detectSaltFromFile(root) ? [root] : []
  }

  if (!stats.isDirectory() || depth < 0) return []

  const results: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name)

    if (entry.isDirectory()) {
      if (depth > 0) {
        results.push(...scanForSaltFiles(entryPath, depth - 1))
      }
      continue
    }

    if (!looksLikeClaudeBinaryCandidate(entryPath)) continue
    if (detectSaltFromFile(entryPath)) results.push(entryPath)
  }

  return uniquePaths(results)
}

function extractWrapperTargets(wrapperPath: string): string[] {
  const ext = extname(wrapperPath).toLowerCase()
  if (!['.cmd', '.bat', '.ps1', '.sh'].includes(ext)) return []

  let content = ''
  try {
    content = readFileSync(wrapperPath, 'utf-8')
  } catch {
    return []
  }

  const wrapperDir = dirname(wrapperPath)
  const targets: Array<string | null> = []
  const patterns = [
    /node_modules[\\/][^\r\n"' ]+/g,
    /claude(?:code)?[\\/][^\r\n"' ]+\.(?:js|cjs|mjs|exe)/gi,
    /[%$][^"' ]*claude[^"' ]+\.(?:js|cjs|mjs|exe)/gi,
    /[A-Za-z]:\\[^"' \r\n]+\.(?:js|cjs|mjs|exe)/g,
  ]

  for (const pattern of patterns) {
    for (const match of content.match(pattern) ?? []) {
      let candidate = match.trim().replace(/^['"]|['"]$/g, '')
      candidate = candidate.replace(/%~dp0/gi, `${wrapperDir}\\`)
      candidate = candidate.replace(/\$PSScriptRoot/gi, wrapperDir)
      candidate = candidate.replace(/[\\/]+/g, process.platform === 'win32' ? '\\' : '/')

      const normalized = isAbsolute(candidate)
        ? normalizeExistingPath(candidate)
        : normalizeExistingPath(resolve(wrapperDir, candidate))

      targets.push(normalized)
    }
  }

  const nearby = [
    join(wrapperDir, '..', 'node_modules', '@anthropic-ai', 'claude-code'),
    join(wrapperDir, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    join(wrapperDir, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'dist'),
    join(wrapperDir, '..', 'node_modules', '@anthropic-ai', 'claude-code', 'vendor'),
  ]

  return uniquePaths([
    ...targets,
    ...nearby.map(path => normalizeExistingPath(resolve(path))),
  ])
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

function inferInstallMethod(filePath: string): ClaudeInstallMethod {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  const ext = extname(normalized)

  if (['.cmd', '.bat', '.ps1', '.sh'].includes(ext)) return 'wrapper'
  if (
    normalized.includes('/.local/share/claude/versions/') ||
    normalized.includes('/.claude/local/') ||
    normalized.includes('/programs/claudecode/')
  ) {
    return 'native'
  }
  if (normalized.includes('/node_modules/@anthropic-ai/claude-code/')) {
    if (
      normalized.includes('/appdata/roaming/npm/') ||
      normalized.includes('/lib/node_modules/') ||
      normalized.includes('/.npm-global/') ||
      normalized.includes('/pnpm/global/')
    ) {
      return 'npm-global'
    }
    return 'npm-local'
  }

  return 'unknown'
}

function getClaudeCandidatePaths(seedPath?: string): string[] {
  const home = homedir()
  const localAppData = process.env.LOCALAPPDATA
  const appData = process.env.APPDATA
  const explicit = seedPath ? [normalizeExistingPath(seedPath)] : []
  const commandCandidates = seedPath ? [] : collectPathCommandCandidates()
  const wrapperDerivedCandidates = uniquePaths(commandCandidates.flatMap(path => extractWrapperTargets(path)))

  const nearbyCandidates = uniquePaths([
    ...explicit,
    ...explicit.flatMap(path => path ? [
      normalizeExistingPath(join(dirname(path), 'claude')),
      normalizeExistingPath(join(dirname(path), 'claude.exe')),
      normalizeExistingPath(join(dirname(path), 'claude.cmd')),
      normalizeExistingPath(join(dirname(path), 'claude.bat')),
      normalizeExistingPath(join(dirname(path), 'claude.ps1')),
      normalizeExistingPath(join(dirname(path), '.local', 'share', 'claude', 'versions')),
      normalizeExistingPath(join(dirname(path), 'node_modules', '@anthropic-ai', 'claude-code')),
    ] : []),
  ])

  const commonInstallCandidates = uniquePaths([
    normalizeExistingPath(join(home, '.local', 'bin', 'claude')),
    normalizeExistingPath(join(home, '.local', 'bin', 'claude.exe')),
    normalizeExistingPath(join(home, '.claude', 'local', 'claude')),
    normalizeExistingPath(join(home, '.claude', 'local', 'claude.exe')),
    normalizeExistingPath(join(home, '.claude', 'local')),
    appData ? normalizeExistingPath(join(appData, 'npm', 'claude.cmd')) : null,
    appData ? normalizeExistingPath(join(appData, 'npm', 'claude.ps1')) : null,
    appData ? normalizeExistingPath(join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code')) : null,
    localAppData ? normalizeExistingPath(join(localAppData, 'Programs', 'ClaudeCode')) : null,
    localAppData ? normalizeExistingPath(join(localAppData, 'Programs', 'ClaudeCode', 'claude.exe')) : null,
  ])

  const binaryNamedCandidates = uniquePaths([
    ...scanClaudeBinaries(join(home, '.local', 'share', 'claude', 'versions')),
    ...scanClaudeBinaries(join(home, '.claude', 'local')),
    ...nearbyCandidates.flatMap(path => scanClaudeBinaries(path)),
    ...wrapperDerivedCandidates.flatMap(path => scanClaudeBinaries(path)),
    ...commonInstallCandidates.flatMap(path => scanClaudeBinaries(path)),
  ])

  const saltDetectedCandidates = uniquePaths([
    ...explicit.flatMap(path => path ? scanForSaltFiles(path) : []),
    ...commandCandidates.flatMap(path => scanForSaltFiles(path)),
    ...wrapperDerivedCandidates.flatMap(path => scanForSaltFiles(path)),
    ...nearbyCandidates.flatMap(path => scanForSaltFiles(path)),
    ...commonInstallCandidates.flatMap(path => scanForSaltFiles(path)),
  ])

  return uniquePaths([
    ...explicit,
    ...commandCandidates,
    ...wrapperDerivedCandidates,
    ...nearbyCandidates,
    ...saltDetectedCandidates,
    ...commonInstallCandidates,
    ...binaryNamedCandidates,
  ])
}

export function inspectClaudeInstallation(binaryPath?: string): ClaudeInstallationInspection {
  const candidatePaths = getClaudeCandidatePaths(binaryPath).filter(isRegularFile)
  const candidates = candidatePaths.map((path): ClaudeCandidateInspection => ({
    path,
    installMethod: inferInstallMethod(path),
    detectedSalt: detectSaltFromFile(path),
  }))

  const resolved = candidates.find(candidate => candidate.detectedSalt) ?? candidates[0] ?? null

  return {
    resolvedPath: resolved?.path ?? null,
    installMethod: resolved?.installMethod ?? null,
    detectedSalt: resolved?.detectedSalt ?? null,
    candidates,
  }
}

/** Resolve the claude binary path (follows symlinks) */
export function findClaudeBinary(): string | null {
  return inspectClaudeInstallation().resolvedPath
}

/** Resolve a provided binary path to a stable real path */
export function resolveBinaryPath(binaryPath?: string): string | null {
  return inspectClaudeInstallation(binaryPath).resolvedPath
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
