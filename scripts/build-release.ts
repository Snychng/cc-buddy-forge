import { createHash } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import { execFileSync } from 'child_process'
import { releaseTargets } from './release-targets.js'

type ReleaseManifest = {
  name: string
  version: string
  tag: string
  repository: string
  homepage: string
  assets: Array<{
    id: string
    bunTarget: string
    binaryName: string
    file: string
    sha256: string
  }>
}

function readPackageJson(): { name: string; version: string } {
  const packageJsonPath = resolve('package.json')
  return JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { name: string; version: string }
}

function run(command: string, args: string[]) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function sha256For(path: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

const pkg = readPackageJson()
const version = process.env.RELEASE_VERSION ?? pkg.version
const tag = process.env.RELEASE_TAG ?? `v${version}`
const repository = process.env.GITHUB_REPOSITORY ?? 'Snychng/cc-buddy-forge'
const homepage = `https://github.com/${repository}`
const releaseDir = resolve('dist/release')
const stagingDir = join(releaseDir, '.staging')
const manifest: ReleaseManifest = {
  name: 'ccbf',
  version,
  tag,
  repository,
  homepage,
  assets: [],
}

rmSync(releaseDir, { recursive: true, force: true })
ensureDir(stagingDir)

for (const target of releaseTargets) {
  const targetStageDir = join(stagingDir, target.id)
  const binaryPath = join(targetStageDir, target.binaryName)
  const archiveName = `ccbf-${version}-${target.id}.tar.gz`
  const archivePath = join(releaseDir, archiveName)

  ensureDir(targetStageDir)

  // 直接从入口编译为单文件二进制，方便分发。
  run('bun', [
    'build',
    '--compile',
    '--target',
    target.bunTarget,
    '--outfile',
    binaryPath,
    'src/index.tsx',
  ])

  if (target.platform !== 'win32') {
    chmodSync(binaryPath, 0o755)
  }

  run('tar', ['-czf', archivePath, '-C', targetStageDir, target.binaryName])

  manifest.assets.push({
    id: target.id,
    bunTarget: target.bunTarget,
    binaryName: target.binaryName,
    file: basename(archivePath),
    sha256: sha256For(archivePath),
  })
}

const checksumLines = manifest.assets.map((asset) => `${asset.sha256}  ${asset.file}`)
writeFileSync(join(releaseDir, 'checksums.txt'), `${checksumLines.join('\n')}\n`, 'utf-8')
writeFileSync(join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

if (!existsSync(join(releaseDir, 'manifest.json'))) {
  throw new Error('Failed to generate dist/release/manifest.json')
}
