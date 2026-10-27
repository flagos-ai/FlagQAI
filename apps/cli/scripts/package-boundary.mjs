/** Fail closed when a CLI tarball crosses the reviewed public distribution boundary. */
export function verifyPackageBoundary(files) {
  const paths = new Set(files.map(file => (typeof file === 'string' ? file : file.path).replaceAll('\\', '/')))
  for (const required of ['package.json', 'README.md', 'LICENSE', 'UPSTREAM.md',
    'OPEN_SOURCE_NOTICES.md', 'THIRD_PARTY_LICENSES', 'LICENSES/FlagQAI-Apache-2.0.txt']) {
    if (!paths.has(required)) throw new Error(`CLI package is missing distribution notice: ${required}`)
  }

  const exact = new Set(['package.json', 'README.md', 'LICENSE', 'UPSTREAM.md',
    'OPEN_SOURCE_NOTICES.md', 'THIRD_PARTY_LICENSES', 'cordis.patch.yml', 'cordis.yml'])
  const prefixes = ['LICENSES/', 'bin/', 'lib/', 'tui-profile/registry/',
    'tui-profile/protocols/', 'tui-profile/schemas/', 'presets/', 'guide/', 'node_modules/']
  for (const path of paths) {
    const parts = path.split('/')
    if (parts.some(part => part === '..' || part === '.')) throw new Error(`Unsafe CLI package member: ${path}`)
    if (path.startsWith('assets/')) {
      throw new Error(`CLI package contains unreviewed artwork: ${path}`)
    }
    if (/(?:^|\/)whaleGirlSprite(?:\.|$)/iu.test(path)) {
      throw new Error(`CLI package contains the unreviewed embedded portrait: ${path}`)
    }
    if (/(?:^|\/)ink\/components\/(?:Button|RawAnsi)(?:\.|$)/u.test(path)) {
      throw new Error(`CLI package contains an unused imported Ink wrapper: ${path}`)
    }
    // The first CLI release excludes raster/vector artwork, animation files,
    // and fonts at every package depth, not only under assets/.
    if (/\.(?:apng|avif|bmp|eot|gif|ico|jpe?g|mov|mp4|otf|png|svg|ttf|webm|webp|woff2?)$/iu.test(path)) {
      throw new Error(`CLI package contains unreviewed artwork or font: ${path}`)
    }
    // sharp is an optional registry dependency, not one of our reviewed
    // bundled packages. Shipping its platform binaries inside this tarball
    // would change the redistribution boundary and require a separate review.
    if (/(?:^|\/)node_modules\/(?:sharp|@img)(?:\/|$)/u.test(path)) {
      throw new Error(`CLI package contains unreviewed sharp binary dependency: ${path}`)
    }
    if (/(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|\.git\/|apps\/desktop\/)/iu.test(path)
      || /(?:^|\/)LICENSE\.fsl(?:$|\.)/iu.test(path)) {
      throw new Error(`CLI package contains private or separately licensed material: ${path}`)
    }
    if (!exact.has(path) && !prefixes.some(prefix => path.startsWith(prefix))) {
      throw new Error(`CLI package contains an unreviewed top-level member: ${path}`)
    }
  }
}
