// Apply view — replace salt and optionally rebuild
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { applySalt, getCurrentSalt, rebuild } from '../core/apply.js'
import { rollWithSalt } from '../core/roller.js'
import { PetCard } from './PetCard.js'

type Props = {
  userId: string
  salt: string
  ccSourcePath?: string
  shouldRebuild?: boolean
}

type State = 'confirm' | 'applying' | 'building' | 'done' | 'error'

export function ApplyView({ userId, salt, ccSourcePath, shouldRebuild }: Props) {
  const [state, setState] = useState<State>('confirm')
  const [error, setError] = useState<string>('')
  const [oldSalt, setOldSalt] = useState<string>('')

  const preview = rollWithSalt(userId, salt)

  useInput((input, key) => {
    if (state !== 'confirm') return

    if (input === 'y' || input === 'Y') {
      setState('applying')
      try {
        const result = applySalt(salt, ccSourcePath)
        setOldSalt(result.oldSalt)

        if (shouldRebuild) {
          setState('building')
          try {
            rebuild(ccSourcePath)
            setState('done')
          } catch (err) {
            setError(`Build failed: ${err instanceof Error ? err.message : err}`)
            setState('error')
          }
        } else {
          setState('done')
        }
      } catch (err) {
        setError(`Apply failed: ${err instanceof Error ? err.message : err}`)
        setState('error')
      }
    } else if (input === 'n' || input === 'N' || key.escape) {
      process.exit(0)
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold>🔧 Apply Salt Change</Text>

      <Box marginTop={1}>
        <PetCard bones={preview.bones} salt={salt} />
      </Box>

      {state === 'confirm' && (
        <Box marginTop={1}>
          <Text>
            Replace SALT with <Text color="cyan" bold>{salt}</Text>?{' '}
            <Text dimColor>(y/n)</Text>
          </Text>
        </Box>
      )}

      {state === 'applying' && <Text color="yellow">⏳ Applying salt...</Text>}
      {state === 'building' && <Text color="yellow">⏳ Rebuilding claude-code...</Text>}

      {state === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green">✅ Salt applied successfully!</Text>
          {oldSalt && <Text dimColor>Old: {oldSalt} → New: {salt}</Text>}
          {!shouldRebuild && (
            <Text dimColor>Run `npm run build` in claude-code to apply changes.</Text>
          )}
        </Box>
      )}

      {state === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">❌ {error}</Text>
        </Box>
      )}
    </Box>
  )
}
