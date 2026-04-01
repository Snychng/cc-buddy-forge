// Pet preview card component — shows sprite, stats, and attributes
import React from 'react'
import { Box, Text } from 'ink'
import type { CompanionBones } from '../core/types.js'
import { RARITY_COLORS, RARITY_STARS } from '../core/types.js'
import { renderSprite } from '../core/sprites.js'

type Props = {
  bones: CompanionBones
  salt: string
  compact?: boolean
}

function StatBar({ name, value }: { name: string; value: number }) {
  const width = 20
  const filled = Math.round((value / 100) * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  const color = value >= 80 ? 'green' : value >= 50 ? 'yellow' : value >= 25 ? 'white' : 'red'
  return (
    <Box>
      <Text>{name.padEnd(10)}</Text>
      <Text color={color}>{bar}</Text>
      <Text> {String(value).padStart(3)}</Text>
    </Box>
  )
}

export function PetCard({ bones, salt, compact }: Props) {
  const sprite = renderSprite(bones)
  const rarityColor = RARITY_COLORS[bones.rarity] as any
  const stars = RARITY_STARS[bones.rarity]

  if (compact) {
    return (
      <Box>
        <Text color={rarityColor}>{stars} </Text>
        <Text bold>{bones.species}</Text>
        <Text> eye={bones.eye} hat={bones.hat}</Text>
        {bones.shiny && <Text color="yellow"> ✨SHINY</Text>}
        <Text dimColor> salt={salt}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box justifyContent="center">
        <Text color={rarityColor} bold>
          {stars} {bones.rarity.toUpperCase()} {bones.species.toUpperCase()}
          {bones.shiny ? ' ✨SHINY✨' : ''}
        </Text>
      </Box>

      <Box justifyContent="center" flexDirection="column" marginY={1}>
        {sprite.map((line, i) => (
          <Text key={i} color={bones.shiny ? 'yellow' : undefined}>{line}</Text>
        ))}
      </Box>

      <Box gap={2}>
        <Box flexDirection="column">
          <Text>Eye: <Text bold>{bones.eye}</Text></Text>
          <Text>Hat: <Text bold>{bones.hat}</Text></Text>
          <Text dimColor>Salt: {salt}</Text>
        </Box>
        <Box flexDirection="column">
          {Object.entries(bones.stats).map(([name, value]) => (
            <StatBar key={name} name={name} value={value} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}
