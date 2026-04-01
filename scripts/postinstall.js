#!/usr/bin/env node

import { createHash } from 'crypto'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import https from 'https'
import { getReleaseTarget } from './release-targets.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(__dirname, '..')

function readPackageJson() {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'))
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function sha256For(path) {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

function download(url, destination) {
  return new Promise((resolvePromise, rejectPromise) => {
    const file = createWriteStream(destination)
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        rmSync(destination, { force: true })
        download(response.headers.location, destination).then(resolvePromise, rejectPromise)
        return
      }

      if (response.statusCode !== 200) {
        file.close()
        rmSync(destination, { force: true })
        rejectPromise(new Error(`Download failed for ${url}: HTTP ${response.statusCode}`))
        return
      }

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolvePromise()
      })
    })

    request.on('error', (err) => {
      file.close()
      rmSync(destination, { force: true })
      rejectPromise(err)
    })
  })
}

async function getManifest(packageJson) {
  const manifestPath = process.env.CCBF_MANIFEST_PATH
  if (manifestPath) {
    const resolvedPath = resolve(manifestPath)
    const manifest = JSON.parse(readFileSync(resolvedPath, 'utf-8'))
    return {
      manifest,
      assetBaseDir: dirname(resolvedPath),
      local: true,
    }
  }

  const baseUrl = process.env.CCBF_RELEASE_BASE_URL
    ?? `${packageJson.homepage}/releases/download/v${packageJson.version}`
  const tempDir = join(packageRoot, 'vendor', '.downloads')
  const manifestFile = join(tempDir, 'manifest.json')
  ensureDir(tempDir)
  await download(`${baseUrl}/manifest.json`, manifestFile)

  return {
    manifest: JSON.parse(readFileSync(manifestFile, 'utf-8')),
    assetBaseUrl: baseUrl,
    local: false,
  }
}

async function acquireArchive(asset, source) {
  const downloadDir = join(packageRoot, 'vendor', '.downloads')
  ensureDir(downloadDir)
  const archivePath = join(downloadDir, asset.file)

  if (source.local) {
    copyFileSync(join(source.assetBaseDir, asset.file), archivePath)
  } else {
    await download(`${source.assetBaseUrl}/${asset.file}`, archivePath)
  }

  const actualSha = sha256For(archivePath)
  if (actualSha !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.file}: expected ${asset.sha256}, got ${actualSha}`)
  }

  return archivePath
}

async function main() {
  if (process.env.CCBF_SKIP_POSTINSTALL === '1') {
    console.log('Skipping ccbf binary download because CCBF_SKIP_POSTINSTALL=1')
    return
  }

  const target = getReleaseTarget(process.platform, process.arch)
  if (!target) {
    console.warn(`Skipping ccbf binary download: unsupported platform ${process.platform}-${process.arch}`)
    return
  }

  const packageJson = readPackageJson()
  const source = await getManifest(packageJson)
  const asset = source.manifest.assets.find((item) => item.id === target.id)

  if (!asset) {
    throw new Error(`No release asset found for ${target.id} in manifest`)
  }

  const archivePath = await acquireArchive(asset, source)
  const targetDir = join(packageRoot, 'vendor', target.id)
  rmSync(targetDir, { recursive: true, force: true })
  ensureDir(targetDir)

  execFileSync('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'inherit' })

  const binaryPath = join(targetDir, target.binaryName)
  if (!existsSync(binaryPath)) {
    throw new Error(`Extracted archive for ${target.id} but binary was not found`)
  }

  if (process.platform !== 'win32') {
    chmodSync(binaryPath, 0o755)
  }
  console.log(`Installed ccbf binary for ${target.id}`)
}

main().catch((err) => {
  if (existsSync(join(packageRoot, 'src', 'index.tsx'))) {
    console.warn(`Skipping ccbf binary download in source checkout: ${err.message}`)
    console.warn('Use Bun for local development: bun run src/index.tsx')
    process.exit(0)
  }

  console.error(`Failed to install ccbf binary: ${err.message}`)
  process.exit(1)
})
