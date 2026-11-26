import { render, screen, waitFor } from '@testing-library/react'
import { MotionGlobalConfig, motion } from 'framer-motion'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installMotionVisibilityGuard } from './motion-visibility'

/**
 * End-to-end cover for the ghost-content defect, exercised through a real
 * `motion.div` using the same variants the dashboard ships
 * (`pageVariants` in features/dashboard/lib/animations.ts).
 *
 * Measured in production: a screen that mounts while the tab is not being
 * rendered stays pinned at `opacity: 0; transform: translateY(12px)` — the
 * `hidden` variant, applied inline, with no animation object ever created,
 * because framer-motion advances animations on requestAnimationFrame and the
 * browser does not deliver rAF to an unrendered document. Observed still at
 * opacity 0 twenty-nine seconds after navigation.
 */

const pageVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

let teardown: (() => void) | undefined

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function Page() {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" data-testid="page">
      Mon cockpit
    </motion.div>
  )
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

describe('entry animations in an unrendered document', () => {
  it('leaves content readable when the page mounts while the tab is hidden', async () => {
    setVisibility('hidden')
    teardown = installMotionVisibilityGuard()

    render(<Page />)

    // The guard makes the animation apply its final keyframe with no frame,
    // so the content is readable the instant the tab is shown.
    await waitFor(() => {
      expect(screen.getByTestId('page')).toHaveStyle({ opacity: '1' })
    })
  })

  it('still animates in from hidden when the tab is visible', () => {
    setVisibility('visible')
    teardown = installMotionVisibilityGuard()

    render(<Page />)

    // Untouched behaviour: the entry animation starts at the `hidden` variant
    // and is driven to completion by rAF, exactly as designed.
    expect(screen.getByTestId('page')).toHaveStyle({ opacity: '0' })
  })
})
