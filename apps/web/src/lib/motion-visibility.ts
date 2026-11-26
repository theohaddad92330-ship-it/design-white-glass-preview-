import { MotionGlobalConfig } from 'framer-motion'

/**
 * Keeps entry animations from leaving content invisible.
 *
 * Framer Motion advances animations on `requestAnimationFrame`, and a browser
 * does not deliver rAF to a document it is not rendering (background tab,
 * fully occluded window, restored session). Our page wrappers mount with
 * `initial="hidden"` (opacity 0), so a screen that mounts while unrendered
 * paints its fully-loaded content at opacity ~0 and stays that way until rAF
 * resumes — a "ghost" screen that reads as a broken app, with nothing in the
 * console to explain it.
 *
 * `MotionGlobalConfig.skipAnimations` makes any animation STARTED while it is
 * set apply its final keyframe immediately, without needing a frame. Pinning it
 * to "the document is not being rendered" means:
 *
 *  - mounted while hidden  → content lands at its final opacity, readable the
 *                            instant the tab is shown;
 *  - mounted while visible → animations play exactly as designed (untouched).
 *
 * This is a correctness guard, not a speed optimisation: it does not shorten a
 * single animation the user can actually see.
 */

let installed = false

function isRendered(): boolean {
  // `visibilityState` is the signal the browser itself uses to decide whether
  // to run the rendering loop, so it is the right thing to key off.
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function sync(): void {
  MotionGlobalConfig.skipAnimations = !isRendered()
}

/**
 * Installs the guard and returns a teardown. Safe to call more than once — the
 * duplicate call is a no-op so callers can never stack listeners.
 */
export function installMotionVisibilityGuard(): () => void {
  if (typeof document === 'undefined' || installed) return () => {}
  installed = true

  sync()
  document.addEventListener('visibilitychange', sync)

  return () => {
    document.removeEventListener('visibilitychange', sync)
    MotionGlobalConfig.skipAnimations = false
    installed = false
  }
}
