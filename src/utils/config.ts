// userId auto-detection from Claude Code config

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function tryReadConfig(path: string): string | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf-8')
    const config = JSON.parse(raw)
    return config.oauthAccount?.accountUuid ?? config.userID ?? null
  } catch {
    return null
  }
}

export function detectUserId(): string {
  const home = homedir()

  // Try paths in order of priority (matching claude-code's getGlobalClaudeFile logic)
  const candidates = [
    join(home, '.claude', '.config.json'),  // legacy path
    join(home, '.claude.json'),              // current default
  ]

  for (const path of candidates) {
    const userId = tryReadConfig(path)
    if (userId) return userId
  }

  throw new Error(
    `Could not detect userId. Tried: ${candidates.join(', ')}. Use --user-id to provide it manually.`
  )
}
