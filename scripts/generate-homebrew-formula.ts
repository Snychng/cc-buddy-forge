import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

type ManifestAsset = {
  id: string
  bunTarget: string
  file: string
  sha256: string
  homebrewKey?: 'darwin-arm64' | 'darwin-x64' | 'linux-x64'
}

type ReleaseManifest = {
  name: string
  version: string
  tag: string
  repository: string
  homepage: string
  assets: ManifestAsset[]
}

function loadManifest(): ReleaseManifest {
  const manifestPath = resolve('dist/release/manifest.json')
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as ReleaseManifest
}

function requireAsset(manifest: ReleaseManifest, key: ManifestAsset['homebrewKey']): ManifestAsset {
  const asset = manifest.assets.find((item) => item.homebrewKey === key)
  if (!asset) {
    throw new Error(`Missing release asset for ${key}`)
  }
  return asset
}

const manifest = loadManifest()
const darwinArm64 = requireAsset(manifest, 'darwin-arm64')
const darwinX64 = requireAsset(manifest, 'darwin-x64')
const linuxX64 = requireAsset(manifest, 'linux-x64')
const baseUrl = `${manifest.homepage}/releases/download/${manifest.tag}`
const formulaPath = resolve(process.env.HOMEBREW_FORMULA_PATH ?? 'dist/release/ccbf.rb')

const formula = `class Ccbf < Formula
  desc "Forge your ideal Claude Code buddy by brute-forcing the perfect salt value"
  homepage "${manifest.homepage}"
  version "${manifest.version}"

  on_macos do
    if Hardware::CPU.arm?
      url "${baseUrl}/${darwinArm64.file}"
      sha256 "${darwinArm64.sha256}"
    else
      url "${baseUrl}/${darwinX64.file}"
      sha256 "${darwinX64.sha256}"
    end
  end

  on_linux do
    url "${baseUrl}/${linuxX64.file}"
    sha256 "${linuxX64.sha256}"
  end

  def install
    bin.install "ccbf"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ccbf --version")
  end
end
`

mkdirSync(dirname(formulaPath), { recursive: true })
writeFileSync(formulaPath, formula, 'utf-8')
