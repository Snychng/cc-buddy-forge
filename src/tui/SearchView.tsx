// Search progress and results TUI
import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { searchAsync, type SearchProgress } from '../core/search.js'
import type { SearchFilter, SearchResult } from '../core/types.js'
import { PetCard } from './PetCard.js'

export type SearchViewCompletion =
  | { action: 'exit'; results: SearchResult[] }
  | { action: 'apply'; result: SearchResult; results: SearchResult[] }

type Props = {
  userId: string
  filter: SearchFilter
  total: number
  saltLen?: number
  onComplete?: (result: SearchViewCompletion) => void
}

function shuffleMatches(items: SearchResult[]): SearchResult[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }
  return shuffled
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const width = 40
  const pct = current / total
  const filled = Math.round(pct * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return (
    <Text>
      [{bar}] {(pct * 100).toFixed(1)}%
    </Text>
  )
}

export function SearchView({ userId, filter, total, saltLen, onComplete }: Props) {
  const [progress, setProgress] = useState<SearchProgress>({
    current: 0, total, matches: [], speed: 0,
  })
  const [done, setDone] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const pageSize = 4
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize))
  const currentPage = Math.floor(selectedIndex / pageSize)
  const pageStart = currentPage * pageSize
  const pageResults = results.slice(pageStart, pageStart + pageSize)

  useEffect(() => {
    searchAsync({
      userId,
      filter,
      total,
      saltLen,
      onProgress: setProgress,
    }).then(results => {
      setDone(true)
      const shuffled = shuffleMatches(results)
      setResults(shuffled)
      setSelectedIndex(0)
    })
  }, [])

  useInput((_input, key) => {
    if (!done) return

    if (key.escape) {
      onComplete?.({ action: 'exit', results })
      return
    }

    if (results.length === 0) return

    if (key.return) {
      onComplete?.({ action: 'apply', result: results[selectedIndex], results })
      return
    }

    if (key.leftArrow) {
      setSelectedIndex(index => Math.max(0, index - 1))
      return
    }

    if (key.rightArrow) {
      setSelectedIndex(index => Math.min(results.length - 1, index + 1))
      return
    }

    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 2))
      return
    }

    if (key.downArrow) {
      setSelectedIndex(index => Math.min(results.length - 1, index + 2))
    }
  }, { isActive: done })

  const filterDesc = Object.entries(filter)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (k === 'minStat' && typeof v === 'object' && v !== null) {
        const stat = v as { name: string; value: number }
        return `${stat.name}>=${stat.value}`
      }
      return `${k}=${v}`
    })
    .join(', ')

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>🔍 Searching salts for: </Text>
        <Text color="cyan">{filterDesc || 'any'}</Text>
      </Box>

      <Box gap={2}>
        <ProgressBar current={progress.current} total={progress.total} />
        <Text dimColor>{progress.speed.toLocaleString()} it/s</Text>
      </Box>

      <Box marginTop={1}>
        <Text>
          Found: <Text color="green" bold>{progress.matches.length}</Text> matches
          {done && <Text color="green"> ✓ Done!</Text>}
        </Text>
      </Box>

      {!done && progress.matches.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Top Results:</Text>
          {progress.matches.slice(0, 5).map((result, i) => (
            <Box key={i} marginTop={1}>
              <PetCard bones={result.roll.bones} salt={result.salt} />
            </Box>
          ))}
          {progress.matches.length > 5 && (
            <Text dimColor>... and {progress.matches.length - 5} more</Text>
          )}
        </Box>
      )}

      {done && results.length === 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">No matches found for the current filter.</Text>
          <Text dimColor>Press Esc to exit, or run again with looser filters / higher --total.</Text>
        </Box>
      )}

      {done && results.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Randomized Results</Text>
          <Text dimColor>
            Search finished. Results were shuffled to avoid the same salts always appearing first.
          </Text>

          <Box flexDirection="column" marginTop={1} gap={1}>
            {[0, 1].map(row => (
              <Box key={row} gap={1}>
                {[0, 1].map(col => {
                  const pageIndex = row * 2 + col
                  const result = pageResults[pageIndex]
                  if (!result) {
                    return null
                  }

                  const absoluteIndex = pageStart + pageIndex
                  return (
                    <Box key={result.salt}>
                      <PetCard
                        bones={result.roll.bones}
                        salt={result.salt}
                        compact
                        selected={absoluteIndex === selectedIndex}
                      />
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>

          <Box marginTop={1}>
            <Text>
              Page <Text color="cyan" bold>{currentPage + 1}</Text>/{totalPages}
              {' · '}
              Selected <Text color="cyan" bold>{selectedIndex + 1}</Text>/{results.length}
            </Text>
          </Box>
          <Text dimColor>Use arrow keys to move. Press Enter to apply the selected pet. Press Esc to exit.</Text>
        </Box>
      )}
    </Box>
  )
}
