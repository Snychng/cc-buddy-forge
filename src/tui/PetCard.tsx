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
  selected?: boolean
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

export function PetCard({ bones, salt, compact, selected }: Props) {
  const sprite = renderSprite(bones)
  const rarityColor = RARITY_COLORS[bones.rarity] as any
  const stars = RARITY_STARS[bones.rarity]

  if (compact) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={selected ? 'cyan' : 'gray'}
        paddingX={1}
      >
        <Text color={selected ? 'cyan' : undefined}>{selected ? '▶ Selected' : '  Candidate'}</Text>
        <Text color={rarityColor} bold>
          {stars} {bones.rarity.toUpperCase()} {bones.species.toUpperCase()}
          {bones.shiny ? ' ✨' : ''}
        </Text>
        <Box gap={2} marginY={1}>
          <Box flexDirection="column" flexGrow={1}>
            <Text>Eye: <Text bold>{bones.eye}</Text>  Hat: <Text bold>{bones.hat}</Text></Text>
            <Text>
              DBG {String(bones.stats.DEBUGGING).padStart(3)}  PAT {String(bones.stats.PATIENCE).padStart(3)}
            </Text>
            <Text>
              CHA {String(bones.stats.CHAOS).padStart(3)}  WIS {String(bones.stats.WISDOM).padStart(3)}
            </Text>
            <Text>SNK {String(bones.stats.SNARK).padStart(3)}</Text>
            <Text dimColor>Salt: {salt}</Text>
          </Box>
          <Box flexDirection="column" minWidth={12}>
            {sprite.map((line, i) => (
              <Text key={i} color={bones.shiny ? 'yellow' : undefined}>{line}</Text>
            ))}
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={selected ? 'cyan' : undefined}
      paddingX={1}
    >
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
