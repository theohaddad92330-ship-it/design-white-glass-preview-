import { useEffect, useState } from 'react'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

export type SidebarSubItem = { id: string; label: string; onClick?: () => void }
export type SidebarSection = { id: string; label: string; children?: SidebarSubItem[] }

export function SectionSidebarNav({ sections }: { sections: SidebarSection[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    if (sections.length === 0) return
    const intersectingIds = new Set<string>()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) intersectingIds.add(entry.target.id)
          else intersectingIds.delete(entry.target.id)
        }
        if (intersectingIds.size === 0) return
        let bestId = ''
        let bestTop = -Infinity
        for (const id of intersectingIds) {
          const el = document.getElementById(id)
          if (!el) continue
          const top = el.getBoundingClientRect().top
          if (top > bestTop) {
            bestTop = top
            bestId = id
          }
        }
        if (bestId) setActive(bestId)
      },
      { rootMargin: '0px 0px -50% 0px', threshold: 0 },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  if (sections.length < 2) return null

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className="space-y-3">
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        Sur cette page
      </Text>
      <div className="space-y-1.5">
        {sections.map(s => (
          <div key={s.id} className="space-y-1">
            <button
              type="button"
              onClick={() => scrollTo(s.id)}
              className={cn(
                'block w-full text-left text-sm transition-colors',
                active === s.id
                  ? 'font-semibold text-[var(--bellum-text-primary)]'
                  : 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-secondary)]',
              )}
            >
              {s.label}
            </button>
            {s.children && s.children.length > 0 && active === s.id && (
              <div className="ml-3 space-y-1 border-l border-white/10 pl-3 pt-1">
                {s.children.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={c.onClick ?? (() => scrollTo(c.id))}
                    className="block w-full truncate text-left text-xs text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-secondary)]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}
