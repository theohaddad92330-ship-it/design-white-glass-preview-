'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'bellum-mgr-theme'

// Light/dark switcher. The actual theme is applied pre-paint by the inline script
// in the root layout (reads localStorage → prefers-color-scheme). Here we only
// mirror + toggle it. `theme === null` until mounted so SSR and the first client
// render agree (avoids a hydration mismatch on the label).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setTheme(current === 'light' ? 'light' : 'dark')
  }, [])

  function toggle(): void {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode / storage disabled — theme still applies for the session */
    }
    setTheme(next)
  }

  const label = theme === null ? '' : theme === 'light' ? 'Sombre' : 'Clair'
  const icon = theme === null ? '🌓' : theme === 'light' ? '🌙' : '☀️'

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label="Basculer le thème clair / sombre"
      title="Basculer le thème clair / sombre"
      suppressHydrationWarning
    >
      <span aria-hidden>{icon}</span>
      {label ? <span>{label}</span> : null}
    </button>
  )
}
