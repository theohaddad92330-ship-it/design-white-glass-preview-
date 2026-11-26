import { MotionGlobalConfig } from 'framer-motion'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMotionVisibilityGuard } from './motion-visibility'

/**
 * Regression cover for the "ghost content" defect: entry animations
 * (`initial="hidden"` → opacity 0) are advanced by framer-motion's
 * requestAnimationFrame loop, and the browser does not deliver rAF to a
 * document it is not rendering. A page that mounts while the tab is hidden
 * therefore paints fully-loaded content at opacity ~0 and only reveals it
 * once rAF resumes — measured in production as a ~17s unreadable screen.
 */

let teardown: (() => void) | undefined

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = false
})

afterEach(() => {
  teardown?.()
  teardown = undefined
  MotionGlobalConfig.skipAnimations = false
  setVisibility('visible')
})

describe('installMotionVisibilityGuard', () => {
  it('skips animations when the document is already hidden at install', () => {
    setVisibility('hidden')

    teardown = installMotionVisibilityGuard()

    expect(MotionGlobalConfig.skipAnimations).toBe(true)
  })

  it('leaves animations running when the document is visible at install', () => {
    setVisibility('visible')

    teardown = installMotionVisibilityGuard()

    expect(MotionGlobalConfig.skipAnimations).toBe(false)
  })

  it('skips animations as soon as the document becomes hidden', () => {
    setVisibility('visible')
    teardown = installMotionVisibilityGuard()

    setVisibility('hidden')

    expect(MotionGlobalConfig.skipAnimations).toBe(true)
  })

  it('restores animations when the document becomes visible again', () => {
    setVisibility('hidden')
    teardown = installMotionVisibilityGuard()

    setVisibility('visible')

    expect(MotionGlobalConfig.skipAnimations).toBe(false)
  })

  it('stops tracking visibility once torn down', () => {
    setVisibility('visible')
    const stop = installMotionVisibilityGuard()

    stop()
    setVisibility('hidden')

    expect(MotionGlobalConfig.skipAnimations).toBe(false)
  })

  it('is idempotent — a second install does not register a second listener', () => {
    setVisibility('visible')
    const first = installMotionVisibilityGuard()
    const second = installMotionVisibilityGuard()

    // The duplicate install is a no-op, so the first teardown fully detaches.
    first()
    setVisibility('hidden')

    expect(MotionGlobalConfig.skipAnimations).toBe(false)
    second()
  })
})
