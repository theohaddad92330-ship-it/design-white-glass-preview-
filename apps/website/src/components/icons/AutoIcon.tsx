'use client'

import { useEffect, useRef, type ForwardRefExoticComponent, type RefAttributes } from 'react'

type AnimatedIconHandle = {
  startAnimation: () => void
  stopAnimation: () => void
}

type AnimatedIconComponent = ForwardRefExoticComponent<
  { size?: number; className?: string } & RefAttributes<AnimatedIconHandle>
>

type AutoIconProps = {
  icon: AnimatedIconComponent
  size?: number
  className?: string
  /** Replay period in ms (default 4500). */
  interval?: number
  /** First-play offset in ms, to stagger several icons (default 0). */
  delay?: number
}

/**
 * Plays a lucide-animated icon on its own, at a frequent interval — Linear-style
 * ambient motion. Still replays on hover. Fully disabled under
 * `prefers-reduced-motion`.
 */
export function AutoIcon({ icon: Icon, size, className, interval = 4500, delay = 0 }: AutoIconProps) {
  const ref = useRef<AnimatedIconHandle>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let resetTimer: ReturnType<typeof setTimeout> | undefined
    // Play once, then reset to the idle state ~1.1s later so the next tick
    // visibly replays (lucide-animated holds its "animate" end state otherwise).
    const play = () => {
      ref.current?.startAnimation()
      resetTimer = setTimeout(() => ref.current?.stopAnimation(), 1100)
    }

    let loop: ReturnType<typeof setInterval> | undefined
    const kickoff = setTimeout(() => {
      play()
      loop = setInterval(play, interval)
    }, delay)

    return () => {
      clearTimeout(kickoff)
      if (resetTimer) clearTimeout(resetTimer)
      if (loop) clearInterval(loop)
    }
  }, [interval, delay])

  return <Icon ref={ref} size={size} className={className} />
}
