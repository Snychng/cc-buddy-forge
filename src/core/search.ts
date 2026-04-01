// Salt brute-force search engine with target attribute filtering

import type { SearchFilter, SearchResult } from './types.js'
import { rollWithSalt } from './roller.js'

function matchesFilter(result: SearchResult, filter: SearchFilter): boolean {
  const { bones } = result.roll
  if (filter.species && bones.species !== filter.species) return false
  if (filter.rarity && bones.rarity !== filter.rarity) return false
  if (filter.eye && bones.eye !== filter.eye) return false
  if (filter.hat && bones.hat !== filter.hat) return false
  if (filter.shiny !== undefined && bones.shiny !== filter.shiny) return false
  if (filter.minStat) {
    const val = bones.stats[filter.minStat.name]
    if (val < filter.minStat.value) return false
  }
  return true
}

export type SearchProgress = {
  current: number
  total: number
  matches: SearchResult[]
  speed: number // iterations per second
}

export type SearchOptions = {
  userId: string
  filter: SearchFilter
  total?: number // default 1_000_000
  onProgress?: (progress: SearchProgress) => void
  batchSize?: number // how many to process before yielding, default 10000
  /** Target salt length — auto-detected from binary, defaults to 15 */
  saltLen?: number
}

/**
 * Generate a salt string of exactly `len` characters.
 * Format: "ccbf-" (5 chars) + zero-padded number (len - 5 chars)
 * This ensures byte-for-byte binary replacement safety.
 */
function makeSalt(i: number, len: number): string {
  const prefix = 'ccbf-'
  const numLen = len - prefix.length
  return `${prefix}${i.toString().padStart(numLen, '0')}`
}

export function search(opts: SearchOptions): SearchResult[] {
  const {
    userId,
    filter,
    total = 1_000_000,
    onProgress,
    batchSize = 10_000,
    saltLen = 15,
  } = opts

  const matches: SearchResult[] = []
  let lastTime = performance.now()
  let lastCount = 0

  for (let i = 0; i < total; i++) {
    const salt = makeSalt(i, saltLen)
    const roll = rollWithSalt(userId, salt)
    const result: SearchResult = { salt, roll }

    if (matchesFilter(result, filter)) {
      matches.push(result)
    }

    if ((i + 1) % batchSize === 0 || i === total - 1) {
      const now = performance.now()
      const elapsed = (now - lastTime) / 1000
      const speed = elapsed > 0 ? (i + 1 - lastCount) / elapsed : 0
      lastTime = now
      lastCount = i + 1

      onProgress?.({
        current: i + 1,
        total,
        matches: [...matches],
        speed: Math.round(speed),
      })
    }
  }

  return matches
}

// Async version that yields to event loop for TUI updates
export async function searchAsync(opts: SearchOptions): Promise<SearchResult[]> {
  const {
    userId,
    filter,
    total = 1_000_000,
    onProgress,
    batchSize = 10_000,
    saltLen = 15,
  } = opts

  const matches: SearchResult[] = []
  let startTime = performance.now()

  for (let i = 0; i < total; i++) {
    const salt = makeSalt(i, saltLen)
    const roll = rollWithSalt(userId, salt)
    const result: SearchResult = { salt, roll }

    if (matchesFilter(result, filter)) {
      matches.push(result)
    }

    if ((i + 1) % batchSize === 0 || i === total - 1) {
      const now = performance.now()
      const elapsed = (now - startTime) / 1000
      const speed = elapsed > 0 ? (i + 1) / elapsed : 0

      onProgress?.({
        current: i + 1,
        total,
        matches: [...matches],
        speed: Math.round(speed),
      })

      // Yield to event loop so ink can re-render
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  return matches
}
