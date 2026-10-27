import { homedir } from 'node:os'
import { join } from 'node:path'

/** Locate the Harness profile selected by the current launcher invocation. */
export function resolveDshProfileName(argv: readonly string[] = process.argv): string | undefined {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--profile') {
      const value = argv[index + 1]
      return value && !value.startsWith('-') ? value : undefined
    }
    if (argument.startsWith('--profile=')) {
      return argument.slice('--profile='.length) || undefined
    }
  }
  return undefined
}

/** A portable distribution has no mutable managed profile installation. */
export function isStandaloneRuntime(): boolean {
  return process.env.FLAGQAI_STANDALONE === '1'
    || process.env.FLAGQAI_STANDALONE_BINARY !== undefined
    || (process.env.DSH_HOME?.includes('flagqai-standalone') ?? false)
}

/** The profile workspace manifest under the active Harness home. */
export function profileWorkspaceYamlPath(profile: string): string {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(dshHome, 'profiles', profile, 'pnpm-workspace.yaml')
}
