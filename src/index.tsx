#!/usr/bin/env bun
import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import { detectUserId } from './utils/config.js'
import { SPECIES, RARITIES, EYES, HATS, STAT_NAMES } from './core/types.js'
import type { SearchFilter, Species, Rarity, Eye, Hat, StatName } from './core/types.js'
import { SearchView } from './tui/SearchView.js'
import { PreviewView } from './tui/PreviewView.js'
import { ApplyView } from './tui/ApplyView.js'

/** Restore cursor visibility on exit — ink hides it and may not restore it */
function restoreCursor() {
  process.stdout.write('\x1B[?25h')
}
process.on('exit', restoreCursor)
process.on('SIGINT', () => { restoreCursor(); process.exit(130) })
process.on('SIGTERM', () => { restoreCursor(); process.exit(143) })

const program = new Command()
  .name('ccbf')
  .description('🔨 Forge your ideal Claude Code buddy by finding the perfect salt')
  .version('1.0.0')

program
  .command('search')
  .description('Search for salt values matching target attributes')
  .option('--species <species>', `Target species (${SPECIES.join(', ')})`)
  .option('--rarity <rarity>', `Target rarity (${RARITIES.join(', ')})`)
  .option('--eye <eye>', 'Target eye style')
  .option('--hat <hat>', `Target hat (${HATS.join(', ')})`)
  .option('--shiny', 'Only find shiny pets')
  .option('--min-stat <stat:value>', 'Minimum stat value (e.g., WISDOM:80)')
  .option('--total <n>', 'Number of salts to try', '1000000')
  .option('--user-id <id>', 'Override userId (auto-detected by default)')
  .action((opts) => {
    const userId = opts.userId ?? detectUserId()

    const filter: SearchFilter = {}
    if (opts.species) {
      if (!SPECIES.includes(opts.species as Species)) {
        console.error(`Invalid species: ${opts.species}`)
        process.exit(1)
      }
      filter.species = opts.species as Species
    }
    if (opts.rarity) {
      if (!RARITIES.includes(opts.rarity as Rarity)) {
        console.error(`Invalid rarity: ${opts.rarity}`)
        process.exit(1)
      }
      filter.rarity = opts.rarity as Rarity
    }
    if (opts.eye) filter.eye = opts.eye as Eye
    if (opts.hat) filter.hat = opts.hat as Hat
    if (opts.shiny) filter.shiny = true
    if (opts.minStat) {
      const [name, val] = opts.minStat.split(':')
      if (!STAT_NAMES.includes(name as StatName) || !val) {
        console.error(`Invalid --min-stat. Use format: STAT_NAME:value`)
        process.exit(1)
      }
      filter.minStat = { name: name as StatName, value: parseInt(val, 10) }
    }

    const total = parseInt(opts.total, 10)
    console.log(`🔑 userId: ${userId}`)
    console.log(`🎯 Filter: ${JSON.stringify(filter)}`)
    console.log(`📊 Searching ${total.toLocaleString()} salt values...\n`)

    const instance = render(
      <SearchView
        userId={userId}
        filter={filter}
        total={total}
        onDone={(results) => {
          instance.unmount()
          if (results.length === 0) {
            console.log('\n😢 No matches found. Try relaxing your filters or increasing --total.')
          }
          process.exit(0)
        }}
      />
    )
  })

program
  .command('preview')
  .description('Preview pet attributes for a given salt')
  .option('--salt <salt>', 'Salt value to preview')
  .option('--user-id <id>', 'Override userId')
  .action((opts) => {
    const userId = opts.userId ?? detectUserId()
    console.log(`🔑 userId: ${userId}\n`)
    const instance = render(<PreviewView userId={userId} salt={opts.salt} />)
    instance.unmount()
    process.exit(0)
  })

program
  .command('apply')
  .description('Apply a salt value to claude-code source')
  .requiredOption('--salt <salt>', 'Salt value to apply')
  .option('--user-id <id>', 'Override userId')
  .option('--source <path>', 'Path to claude-code source')
  .option('--rebuild', 'Rebuild claude-code after applying')
  .action((opts) => {
    const userId = opts.userId ?? detectUserId()
    render(
      <ApplyView
        userId={userId}
        salt={opts.salt}
        ccSourcePath={opts.source}
        shouldRebuild={opts.rebuild}
        onExit={() => process.exit(0)}
      />
    )
  })

program.parse()
