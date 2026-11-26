import { LAYOUT_TRANSITION } from '@bellum/ui'
export const easeOut = [0.23, 1, 0.32, 1] as const
export const layoutTransition = LAYOUT_TRANSITION
export const rowTransition = { duration: 0.18, ease: easeOut } as const
