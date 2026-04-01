#!/usr/bin/env bun
import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import { detectUserId } from './utils/config.js'
import { getRecordedOriginalSalt, recordOriginalSalt } from './utils/state.js'
import { SPECIES, RARITIES, EYES, HATS, STAT_NAMES } from './core/types.js'
import type { SearchFilter, Species, Rarity, Eye, Hat, StatName } from './core/types.js'
import { SearchView } from './tui/SearchView.js'
import { PreviewView } from './tui/PreviewView.js'
import { applyBinary, restoreBinary, detectBinarySalt, FALLBACK_SALT, resolveBinaryPath } from './core/apply.js'
import { rollWithSalt } from './core/roller.js'

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

program.hook('preAction', (_thisCommand, actionCommand) => {
  const opts = actionCommand.opts()
  const filePath = resolveBinaryPath(typeof opts.binary === 'string' ? opts.binary : undefined)
  if (!filePath) return

  const detected = detectBinarySalt(filePath)
  if (!detected) return

  // 只在当前 salt 看起来还是原始值时自动建档，避免首次运行时把已修补值误记为原始值。
  if (detected.salt.startsWith('ccbf-')) return

  recordOriginalSalt(filePath, detected.salt)
})

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
    const detected = detectBinarySalt()
    const saltLen = detected?.length ?? FALLBACK_SALT.length
    console.log(`🔑 userId: ${userId}`)
    console.log(`🧂 Current salt: "${detected?.salt ?? FALLBACK_SALT}" (${saltLen} chars)`)
    console.log(`🎯 Filter: ${JSON.stringify(filter)}`)
    console.log(`📊 Searching ${total.toLocaleString()} salt values...\n`)

    const instance = render(
      <SearchView
        userId={userId}
        filter={filter}
        total={total}
        saltLen={saltLen}
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
  .command('patch')
  .description('Patch the installed Claude Code binary directly (no rebuild needed)')
  .requiredOption('--salt <salt>', 'Salt value to apply')
  .option('--binary <path>', 'Path to claude binary (auto-detected)')
  .option('--user-id <id>', 'Override userId')
  .action((opts) => {
    const userId = opts.userId ?? detectUserId()
    const filePath = resolveBinaryPath(opts.binary)
    const detected = detectBinarySalt(filePath ?? undefined)

    if (!filePath || !detected) {
      console.error('❌ Could not detect salt in Claude Code binary.')
      console.error('   Is Claude Code installed? Try: curl -fsSL https://claude.ai/install.sh | bash')
      process.exit(1)
    }

    if (opts.salt.length !== detected.length) {
      console.error(`❌ Salt "${opts.salt}" is ${opts.salt.length} chars, but current salt "${detected.salt}" is ${detected.length} chars.`)
      console.error(`   Use "ccbf search" to find compatible salts (auto-generates ${detected.length}-char salts).`)
      process.exit(1)
    }

    // Preview what the pet will look like
    const roll = rollWithSalt(userId, opts.salt)
    console.log(`🔑 userId: ${userId}`)
    console.log(`🧂 salt: ${opts.salt}`)
    console.log(`🐾 Result: ${roll.bones.rarity} ${roll.bones.species}${roll.bones.shiny ? ' ✨' : ''}\n`)

    try {
      const saved = recordOriginalSalt(filePath, detected.salt)
      const result = applyBinary(opts.salt, filePath)
      console.log(`✅ Patched ${result.patchCount} occurrence(s) in ${result.filePath}`)
      console.log(`   Old: ${result.oldSalt} → New: ${opts.salt}`)
      if (saved) {
        console.log(`   Saved original salt for one-command restore: ${detected.salt}`)
      }
      console.log(`\n   Restart Claude Code to see your new buddy!`)
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  })

program
  .command('restore')
  .description('Restore the original salt in the Claude Code binary')
  .option('--binary <path>', 'Path to claude binary (auto-detected)')
  .action((opts) => {
    try {
      const filePath = resolveBinaryPath(opts.binary)
      if (!filePath) {
        throw new Error('Could not find claude binary. Use --binary <path> or install Claude Code first.')
      }

      const detected = detectBinarySalt(filePath)
      if (!detected) {
        throw new Error('Could not detect the current salt in Claude Code binary.')
      }

      const originalSalt = getRecordedOriginalSalt(filePath)
      if (!originalSalt) {
        if (!detected.salt.startsWith('ccbf-')) {
          recordOriginalSalt(filePath, detected.salt)
          console.log(`ℹ️ No saved original salt existed yet. Recorded current salt: ${detected.salt}`)
          console.log('✅ Claude Code is already using its original buddy salt.')
          return
        }

        throw new Error(
          `No saved original salt found for ${filePath}. ` +
          'Automatic restore only works after ccbf has recorded the binary before patching.'
        )
      }

      const result = restoreBinary(originalSalt, filePath)
      if (result.patchCount === 0) {
        console.log(`✅ Claude Code is already using the original salt: ${result.restoredSalt}`)
        return
      }

      console.log(`✅ Restored ${result.patchCount} occurrence(s) in ${result.filePath}`)
      console.log(`   Old: ${result.previousSalt} → Restored: ${result.restoredSalt}`)
    } catch (err) {
      console.error(`❌ ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  })

program.parse()
