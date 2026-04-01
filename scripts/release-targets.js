export const releaseTargets = [
  {
    id: 'darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
    bunTarget: 'bun-darwin-arm64',
    binaryName: 'ccbf',
  },
  {
    id: 'darwin-x64',
    platform: 'darwin',
    arch: 'x64',
    bunTarget: 'bun-darwin-x64',
    binaryName: 'ccbf',
  },
  {
    id: 'linux-x64',
    platform: 'linux',
    arch: 'x64',
    bunTarget: 'bun-linux-x64-baseline',
    binaryName: 'ccbf',
  },
  {
    id: 'win32-x64',
    platform: 'win32',
    arch: 'x64',
    bunTarget: 'bun-windows-x64-baseline',
    binaryName: 'ccbf.exe',
  },
]

export function getReleaseTarget(platform, arch) {
  return releaseTargets.find((target) => target.platform === platform && target.arch === arch) ?? null
}
