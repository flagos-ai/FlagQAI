/** Pass only registry transport settings into a fresh acceptance HOME. */
export function acceptanceInstallEnvironment(source) {
  const keys = [
    'NPM_CONFIG_REGISTRY', 'npm_config_registry',
    'NPM_CONFIG_REPLACE_REGISTRY_HOST', 'npm_config_replace_registry_host',
  ]
  return Object.fromEntries(keys.flatMap(key => source[key] === undefined ? [] : [[key, source[key]]]))
}

/** Keep the public registry default only when no explicit transport was supplied. */
export function acceptanceRegistryEnvironment(source) {
  const transport = acceptanceInstallEnvironment(source)
  if (transport.NPM_CONFIG_REGISTRY === undefined && transport.npm_config_registry === undefined) {
    transport.npm_config_registry = 'https://registry.npmjs.org/'
  }
  return transport
}
