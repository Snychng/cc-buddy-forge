# cc-buddy-forge (ccbf)

<p align="center">
  <img src="./assets/ccbf-pixel-buddy.svg" width="220" alt="Pixel-art cc-buddy-forge mascot forging salt with a hammer" />
</p>

<p align="center"><strong>Forge your ideal Claude Code buddy, one salt at a time.</strong></p>

<p align="center"><a href="./README.md">中文</a> | English</p>

Forge your ideal Claude Code buddy by brute-forcing the perfect salt value.

Claude Code's buddy system generates pet attributes deterministically from `hash(userId + SALT)`. This tool searches through millions of salt values to find the combination that produces your dream pet — then applies it directly to your local Claude Code binary.

## Install

```bash
# npm global install
npm install -g cc-buddy-forge
ccbf --help
```

If you hit a permissions error during install, try:

```bash
sudo npm install -g cc-buddy-forge
```

This installs a small Node launcher, then downloads the matching precompiled `ccbf` binary from GitHub Releases during `postinstall`.
Requires Node 18+ for the npm-installed launcher.
You can also download the matching archive for your platform from GitHub Releases, extract it, and put `ccbf` on your `PATH`.

## Local Setup

```bash
# Prerequisites: Bun >= 1.0
# https://bun.sh

# Clone and install
git clone https://github.com/Snychng/cc-buddy-forge.git
cd cc-buddy-forge
bun install

# Register the global `ccbf` command
bun link

# You're ready to go
ccbf --help
```

## Commands

### `ccbf search`

Search for salt values that produce pets matching your criteria. Salt length is auto-detected from your installed Claude Code binary.

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

### `ccbf patch`

Patch the installed Claude Code binary directly — no source code or rebuild needed. Works with `install.sh` installations.
On macOS, `ccbf` automatically re-signs the modified binary with an ad-hoc signature so Claude Code does not fail with `SIGKILL (Code Signature Invalid)`.
On first use, `ccbf` records the binary's original salt so `ccbf restore` can later revert your buddy automatically.

```bash
# Patch with a salt from search results
ccbf patch --salt "ccbf-0000000088"

# Specify custom binary path
ccbf patch --salt "ccbf-0000000088" --binary /path/to/claude
```

### `ccbf restore`

Restore the original salt in the Claude Code binary using the saved snapshot from your first run or first patch.
On macOS, `ccbf` also re-signs the restored binary automatically.

```bash
# Restore your original buddy automatically
ccbf restore

# Restore a specific Claude binary
ccbf restore --binary /path/to/claude
```

### `ccbf preview`

Preview your current buddy, or compare with a different salt.

```bash
# Show current pet
ccbf preview

# Preview a specific salt
ccbf preview --salt "ccbf-0000000088"
```

## How It Works

1. Claude Code generates pet attributes from `mulberry32(hash(userId + SALT))`
2. The SALT is hardcoded in the Claude Code binary
3. `ccbf search` auto-detects the current salt length and generates candidate salts of the exact same length
4. Each salt produces a completely different pet — species, rarity, stats, everything
5. `ccbf patch` does a safe byte-for-byte replacement in the binary (same length = no structural damage)
6. `ccbf` saves the original salt in `~/.ccbf.json` so restore can be one command later

## Binary Patching

For users who installed Claude Code via `curl -fsSL https://claude.ai/install.sh | bash`:

- `ccbf search` auto-detects the salt from the installed binary and generates salts of matching length
- `ccbf patch` replaces the salt in-place — no source code, no rebuild, no recompilation
- `ccbf restore` reverts to the recorded original salt at any time
- Safe byte-for-byte replacement: new salt is always the exact same length as the original
- On macOS, patched/restored binaries are automatically ad-hoc signed after modification

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
    apply.ts         # Salt replacement (binary patch)
  tui/
    PetCard.tsx      # Pet preview card (sprite + stats)
    SearchView.tsx   # Search progress + results
    PreviewView.tsx  # Current vs preview comparison
  utils/
    config.ts        # userId auto-detection
    state.ts         # saved original salt snapshots
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

## Release Flow

1. Update `package.json` version.
2. Push a tag like `v1.2.3`.
3. GitHub Actions builds macOS arm64/x64 and Linux x64 binaries, creates a GitHub Release, and uploads checksums plus `manifest.json`.
4. If the repository has an `NPM_TOKEN` secret configured, the same workflow publishes `cc-buddy-forge` to npm after the Release assets are online.

## Notes

- Requires Bun (not Node) — the hash function uses `Bun.hash` for exact parity with Claude Code
- userId is auto-detected from `~/.claude.json` or `~/.claude/.config.json`
- Original binary salts are stored in `~/.ccbf.json`
- Only modifies your local installation — does not affect other users
- The `patch` command modifies the Claude Code binary at `~/.local/share/claude/versions/`
- npm installation currently supports the same precompiled targets as GitHub Releases: macOS arm64/x64 and Linux x64
- To publish to npm from GitHub Actions, add `NPM_TOKEN` in repository secrets
