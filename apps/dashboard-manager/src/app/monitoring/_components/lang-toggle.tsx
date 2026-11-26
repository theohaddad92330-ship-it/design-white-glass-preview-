'use client'

import { useRouter } from 'next/navigation'

// FR/EN switch for the monitoring screens. Persists the choice in the `dm_lang`
// cookie (read server-side by getLang) and refreshes so the server re-renders in
// the new locale. Scoped to this feature — the rest of the backoffice is FR-only.
export function LangToggle({ lang }: { lang: 'fr' | 'en' }) {
  const router = useRouter()

  function set(next: 'fr' | 'en') {
    if (next === lang) return
    // 1 year, root path so both /monitoring and /monitoring/[id] pick it up.
    document.cookie = `dm_lang=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, fontSize: 12 }}>
      {(['fr', 'en'] as const).map(l => (
        <button
          key={l}
          className="link-muted"
          onClick={() => set(l)}
          style={{ fontWeight: l === lang ? 700 : 400, color: l === lang ? 'var(--text)' : 'var(--muted)' }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  )
}
