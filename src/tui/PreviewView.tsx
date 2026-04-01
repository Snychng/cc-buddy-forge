// Preview view — show current pet and a preview with a given salt
import React from 'react'
import { Box, Text } from 'ink'
import { rollOriginal, rollWithSalt } from '../core/roller.js'
import { PetCard } from './PetCard.js'
import { ORIGINAL_SALT } from '../core/roller.js'

type Props = {
  userId: string
  salt?: string
}

export function PreviewView({ userId, salt }: Props) {
  const current = rollOriginal(userId)

  return (
    <Box flexDirection="column">
      <Text bold>📋 Current Pet (salt: {ORIGINAL_SALT})</Text>
      <PetCard bones={current.bones} salt={ORIGINAL_SALT} />

      {salt && salt !== ORIGINAL_SALT && (
        <>
          <Box marginTop={1}>
            <Text bold>🔮 Preview with salt: {salt}</Text>
          </Box>
          <PetCard bones={rollWithSalt(userId, salt).bones} salt={salt} />
        </>
      )}
    </Box>
  )
}
