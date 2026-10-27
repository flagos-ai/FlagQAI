/**
 * Type augmentations for the inherited renderer.
 *
 * This file is a MODULE (top-level import) so every `declare module` block is
 * a module augmentation that merges with the real declarations — a global
 * script file would shadow them instead.
 */
import type {} from 'react'

// Custom renderer JSX element declarations.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': unknown
      'ink-text': unknown
      'ink-link': unknown
      'ink-image': unknown
      'ink-raw': unknown
      'ink-raw-ansi': unknown
    }
  }
}
