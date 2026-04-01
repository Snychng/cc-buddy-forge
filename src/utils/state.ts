import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'

type SaltSnapshot = {
  originalSalt: string
  recordedAt: string
}

type StateFile = {
  version: 1
  binaries: Record<string, SaltSnapshot>
}

function getStateFilePath(): string {
  return process.env.CCBF_STATE_FILE ?? join(homedir(), '.ccbf.json')
}

function readState(): StateFile {
  const filePath = getStateFilePath()

  try {
    if (!existsSync(filePath)) {
      return { version: 1, binaries: {} }
    }

    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StateFile>
    return {
      version: 1,
      binaries: parsed.binaries ?? {},
    }
  } catch {
    return { version: 1, binaries: {} }
  }
}

function writeState(state: StateFile): void {
  const filePath = getStateFilePath()
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

export function getRecordedOriginalSalt(binaryPath: string): string | null {
  const state = readState()
  return state.binaries[binaryPath]?.originalSalt ?? null
}

export function recordOriginalSalt(binaryPath: string, originalSalt: string): boolean {
  const state = readState()

  if (state.binaries[binaryPath]?.originalSalt) {
    return false
  }

  state.binaries[binaryPath] = {
    originalSalt,
    recordedAt: new Date().toISOString(),
  }
  writeState(state)
  return true
}
