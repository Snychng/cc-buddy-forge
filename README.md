# cc-buddy-forge (ccbf)

Forge your ideal Claude Code buddy by brute-forcing the perfect salt value.

Claude Code's buddy system generates pet attributes deterministically from `hash(userId + SALT)`. This tool searches through millions of salt values to find the combination that produces your dream pet — then applies it to your local Claude Code source.

## Quick Start

```bash
# Prerequisites: Bun >= 1.0
# https://bun.sh

# Clone and install
git clone <repo-url> cc-buddy-forge
cd cc-buddy-forge
bun install

# Register the global `ccbf` command
bun link

# You're ready to go
ccbf --help
```

## Commands

### `ccbf preview`

Preview your current buddy, or compare with a different salt.

```bash
# Show current pet
ccbf preview

# Preview a specific salt
ccbf preview --salt "friend-2026-401-6647"
```

### `ccbf search`

Search for salt values that produce pets matching your criteria.

```bash
# Find legendary dragons (default: 1M iterations)
ccbf search --species dragon --rarity legendary

# Find any shiny pet
ccbf search --shiny

# Find epic cats with high CHAOS stat
ccbf search --species cat --rarity epic --min-stat CHAOS:80

# Search more salts for rare combinations
ccbf search --species dragon --rarity legendary --shiny --total 10000000

# Use a custom userId
ccbf search --species owl --rarity rare --user-id "your-user-id"
```

**Available filters:**

| Flag | Values |
|------|--------|
| `--species` | duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk |
| `--rarity` | common (60%), uncommon (25%), rare (10%), epic (4%), legendary (1%) |
| `--eye` | `·` `✦` `×` `◉` `@` `°` |
| `--hat` | none, crown, tophat, propeller, halo, wizard, beanie, tinyduck |
| `--shiny` | 1% chance, no value needed |
| `--min-stat` | DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK (format: `NAME:value`) |
| `--total` | Number of salts to try (default: 1000000) |

### `ccbf apply`

Apply a found salt to your Claude Code source code.

```bash
# Apply salt (will ask for confirmation)
ccbf apply --salt "friend-2026-401-6647"

# Apply and rebuild
ccbf apply --salt "friend-2026-401-6647" --rebuild

# Specify custom source path
ccbf apply --salt "friend-2026-401-6647" --source ~/my-claude-code
```

## How It Works

1. Claude Code generates pet attributes from `mulberry32(hash(userId + SALT))`
2. The SALT is hardcoded as `'friend-2026-401'` in `src/buddy/companion.ts`
3. This tool tries salt variations like `friend-2026-401-0`, `friend-2026-401-1`, ... up to your specified total
4. Each salt produces a completely different pet — species, rarity, stats, everything
5. When you find one you like, `apply` replaces the SALT constant in the source

## Performance

Typical search speed: ~1,000,000 iterations/second on Apple Silicon. A full 1M search completes in about 1 second.

| Target | Expected matches per 1M |
|--------|------------------------|
| Specific species | ~55,000 |
| Legendary | ~10,000 |
| Legendary + species | ~550 |
| Shiny | ~10,000 |
| Shiny + legendary | ~100 |
| Shiny + legendary + species | ~5 |

## Project Structure

```
src/
  index.tsx          # CLI entry (commander)
  core/
    types.ts         # Species, Rarity, Stats types & constants
    roller.ts        # PRNG (mulberry32) + hash + roll logic
    search.ts        # Brute-force search engine
    sprites.ts       # ASCII art for all 18 species
    apply.ts         # Salt replacement + rebuild
  tui/
    PetCard.tsx      # Pet preview card (sprite + stats)
    SearchView.tsx   # Search progress + results
    PreviewView.tsx  # Current vs preview comparison
    ApplyView.tsx    # Apply confirmation UI
  utils/
    config.ts        # userId auto-detection
```

## Development

```bash
# Run directly
bun run src/index.tsx preview

# Run via npm scripts
bun run search    # alias for: bun run src/index.tsx search
bun run preview   # alias for: bun run src/index.tsx preview

# Type check
bun run tsc --noEmit
```

## Notes

- Requires Bun (not Node) — the hash function uses `Bun.hash` for exact parity with Claude Code
- userId is auto-detected from `~/.claude.json` or `~/.claude/.config.json`
- Only modifies your local source — does not affect other users
- The `apply` command modifies `src/buddy/companion.ts` in your Claude Code source directory (defaults to `~/Developer/claude-code-source-code`)
