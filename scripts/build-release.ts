import { createHash } from 'crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import { execFileSync } from 'child_process'

type ReleaseTarget = {
  id: string
  bunTarget: string
  homebrewKey?: 'darwin-arm64' | 'darwin-x64' | 'linux-x64'
}

type ReleaseManifest = {
  name: string
  version: string
  tag: string
  repository: string
  homepage: string
  assets: Array<{
    id: string
    bunTarget: string
    file: string
    sha256: string
    homebrewKey?: 'darwin-arm64' | 'darwin-x64' | 'linux-x64'
  }>
}

const targets: ReleaseTarget[] = [
  { id: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', homebrewKey: 'darwin-arm64' },
  { id: 'darwin-x64', bunTarget: 'bun-darwin-x64', homebrewKey: 'darwin-x64' },
  { id: 'linux-x64', bunTarget: 'bun-linux-x64-baseline', homebrewKey: 'linux-x64' },
]

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

for (const target of targets) {
  const targetStageDir = join(stagingDir, target.id)
  const binaryPath = join(targetStageDir, 'ccbf')
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

  chmodSync(binaryPath, 0o755)

  run('tar', ['-czf', archivePath, '-C', targetStageDir, 'ccbf'])

  manifest.assets.push({
    id: target.id,
    bunTarget: target.bunTarget,
    file: basename(archivePath),
    sha256: sha256For(archivePath),
    homebrewKey: target.homebrewKey,
  })
}

const checksumLines = manifest.assets.map((asset) => `${asset.sha256}  ${asset.file}`)
writeFileSync(join(releaseDir, 'checksums.txt'), `${checksumLines.join('\n')}\n`, 'utf-8')
writeFileSync(join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')

if (!existsSync(join(releaseDir, 'manifest.json'))) {
  throw new Error('Failed to generate dist/release/manifest.json')
}
