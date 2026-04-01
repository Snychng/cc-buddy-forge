// Search progress and results TUI
import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { searchAsync, type SearchProgress } from '../core/search.js'
import type { SearchFilter, SearchResult } from '../core/types.js'
import { PetCard } from './PetCard.js'

type Props = {
  userId: string
  filter: SearchFilter
  total: number
  compact?: boolean
  onDone?: (results: SearchResult[]) => void
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

export function SearchView({ userId, filter, total, compact, onDone }: Props) {
  const [progress, setProgress] = useState<SearchProgress>({
    current: 0, total, matches: [], speed: 0,
  })
  const [done, setDone] = useState(false)

  useEffect(() => {
    searchAsync({
      userId,
      filter,
      total,
      onProgress: setProgress,
      maxSaltLen: compact ? 15 : undefined,
    }).then(results => {
      setDone(true)
      onDone?.(results)
    })
  }, [])

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

      {progress.matches.length > 0 && (
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
    </Box>
  )
}
