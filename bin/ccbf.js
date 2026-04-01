#!/usr/bin/env node

import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getReleaseTarget } from '../scripts/release-targets.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(__dirname, '..')
const target = getReleaseTarget(process.platform, process.arch)

if (!target) {
  console.error(`ccbf does not currently support ${process.platform}-${process.arch} via npm binary install.`)
  process.exit(1)
}

const binaryPath = join(packageRoot, 'vendor', target.id, target.binaryName)

if (!existsSync(binaryPath)) {
  console.error('ccbf binary is missing.')
  console.error('Try reinstalling the package: npm install -g cc-buddy-forge')
  console.error('If you are installing from source, run with Bun instead: bun run src/index.tsx')
  process.exit(1)
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error(`Failed to launch ccbf binary: ${err.message}`)
  process.exit(1)
})
