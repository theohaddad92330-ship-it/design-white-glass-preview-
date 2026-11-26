import { useCallback, useEffect, useState } from 'react'
import { DevStatusBar } from './DevStatusBar'

const DEV_TOOLBAR_VISIBLE_KEY = 'seed-dev-toolbar-visible'
const DEV_TOOLBAR_OFFSET_PX = 28

function getInitialVisibility(): boolean {
  try {
    const stored = localStorage.getItem(DEV_TOOLBAR_VISIBLE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export function DevToolbarWrapper() {
  const [isVisible, setIsVisible] = useState(getInitialVisibility)
  const viteEnv = (import.meta.env.VITE_ENV as string) || 'development'

  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => {
      const newValue = !prev
      try {
        localStorage.setItem(DEV_TOOLBAR_VISIBLE_KEY, String(newValue))
      } catch {
        // Ignore localStorage errors
      }
      return newValue
    })
  }, [])

  useEffect(() => {
    if (viteEnv === 'production') return

    const appShell = document.getElementById('app-shell')
    if (!appShell) return

    const previousHeight = appShell.style.height
    const previousTransition = appShell.style.transition

    appShell.style.transition = 'height 180ms ease-out'
    appShell.style.height = isVisible ? `calc(100dvh - ${DEV_TOOLBAR_OFFSET_PX}px)` : '100dvh'
    appShell.style.overflow = 'hidden'

    return () => {
      appShell.style.height = previousHeight
      appShell.style.transition = previousTransition
      appShell.style.overflow = ''
    }
  }, [isVisible, viteEnv])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleVisibility()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleVisibility])

  if (viteEnv === 'production') return null
  if (!isVisible) return <DevStatusBar collapsed onHide={toggleVisibility} onExpand={toggleVisibility} />

  return <DevStatusBar onHide={toggleVisibility} />
}
