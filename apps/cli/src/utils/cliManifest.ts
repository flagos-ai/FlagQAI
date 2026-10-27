import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { valid } from 'semver'

function installedCliManifest(): Record<string, unknown> | undefined {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const relativePath of ['../../../package.json', '../../package.json']) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(here, relativePath), 'utf8'))
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const manifest = parsed as Record<string, unknown>
        if (manifest.name === '@flagqai/cli') return manifest
      }
    } catch {
      // Try the source-layout fallback after the compiled-layout path.
    }
  }
  return undefined
}

/** Read the installed CLI's version without importing the terminal updater. */
export function installedTuiVersion(): string | undefined {
  const version = installedCliManifest()?.version
  return typeof version === 'string' && valid(version) !== null ? version : undefined
}

export function isUnpublishedCliPreview(): boolean {
  return installedCliManifest()?.private === true
}
