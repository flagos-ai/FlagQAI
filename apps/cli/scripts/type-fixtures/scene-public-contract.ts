import type { Context } from '@deepseek-ai/cordis'
import type { TuiSceneDescriptor, TuiSceneProps } from '../../src/scenes.js'

type IsAny<T> = 0 extends (1 & T) ? true : false
type AssertFalse<T extends false> = T
type UiIsTyped = AssertFalse<IsAny<TuiSceneProps['ui']>>

declare const scene: TuiSceneDescriptor
declare const context: Context
declare const ui: TuiSceneProps['ui']

// A plugin keeps its typed UI kit and can register through Cordis.
const box = ui.Box
context.tuiScenes.register(scene)
export type ScenePublicContract = [UiIsTyped, typeof box]
