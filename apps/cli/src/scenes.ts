// Re-export shim: the Cordis-backed implementation lives behind the adapter
// boundary so UI consumers never import official @deepseek-ai/* packages.
import type { ComponentType } from 'react'
import type { TuiSceneProps as RuntimeSceneProps, TuiSceneDescriptor as RuntimeSceneDescriptor } from './dsh-adapter/scenes.js'

export { name, TuiSceneRuntime } from './dsh-adapter/scenes.js'
export interface TuiSceneProps extends Omit<RuntimeSceneProps, 'ui'> {
  /** The full terminal kit stays on the public TUI type surface only. */
  ui: typeof import('./ui.js')
}

export interface TuiSceneDescriptor extends Omit<RuntimeSceneDescriptor, 'component'> {
  component: ComponentType<TuiSceneProps>
}
export { default } from './dsh-adapter/scenes.js'
