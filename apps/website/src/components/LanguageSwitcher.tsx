'use client'

import { cn } from '@bellum/ui'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'

/**
 * Language labels are endonyms (each language named in itself) — the standard
 * for language switchers, so a visitor always recognises their own language no
 * matter which locale the page is rendered in. Kept out of the catalogs on
 * purpose: these strings are locale-invariant.
 */
const LABELS: Record<Locale, { short: string; long: string }> = {
  fr: { short: 'FR', long: 'Français' },
  en: { short: 'EN', long: 'English' },
  de: { short: 'DE', long: 'Deutsch' },
  nl: { short: 'NL', long: 'Nederlands' },
}

/**
 * Compact language menu. A single globe + active-locale button opens a dropdown
 * listing every locale by its endonym. Compact by design: the trigger stays a
 * fixed ~1 code wide whatever the label lengths, so the header never overflows
 * into the centre nav — and it scales to any number of future locales (the menu
 * grows vertically, never horizontally).
 *
 * Keeps the visitor on the current page: `usePathname()` returns the locale-less
 * path and the i18n `Link` re-prefixes it for the target locale.
 *
 * Accessibility: a WAI-ARIA menu-button. The trigger owns `aria-haspopup`,
 * `aria-expanded` and `aria-controls`; the panel is a `role="menu"` of
 * `role="menuitem"` links with `aria-current` on the active one. Opens with
 * Enter/Space/Arrow keys, closes on outside click, Escape or Tab, and supports
 * Arrow/Home/End roving focus. On open, focus lands on the active locale.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = usePathname()
  const active = useLocale() as Locale
  const t = useTranslations('common.switcher')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const menuId = useId()

  // Close when clicking outside the switcher.
  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // On open, move focus to the active locale (or the first item as a fallback).
  useEffect(() => {
    if (!open) return
    const activeIndex = routing.locales.indexOf(active)
    itemRefs.current[activeIndex >= 0 ? activeIndex : 0]?.focus()
  }, [open, active])

  function focusItem(index: number) {
    const count = routing.locales.length
    itemRefs.current[((index % count) + count) % count]?.focus()
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex(el => el === document.activeElement)
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
        break
      case 'ArrowDown':
        event.preventDefault()
        focusItem(current + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusItem(current - 1)
        break
      case 'Home':
        event.preventDefault()
        focusItem(0)
        break
      case 'End':
        event.preventDefault()
        focusItem(routing.locales.length - 1)
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <div ref={containerRef} className={cn('relative inline-block text-left', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('ariaLabel')} — ${LABELS[active].long}`}
        onClick={() => setOpen(prev => !prev)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5',
          'text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white',
          open && 'bg-white/10 text-white',
        )}
      >
        <Globe size={14} aria-hidden className="shrink-0" />
        <span>{LABELS[active].short}</span>
        <ChevronDown size={14} aria-hidden className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('ariaLabel')}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'absolute right-0 top-full z-50 mt-2 min-w-[10rem] rounded-2xl border border-white/10 p-1',
            'bg-[rgba(13,13,20,0.97)] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur',
          )}
        >
          {routing.locales.map((locale, index) => {
            const isActive = locale === active
            return (
              <Link
                key={locale}
                ref={el => {
                  itemRefs.current[index] = el
                }}
                href={pathname}
                locale={locale}
                role="menuitem"
                tabIndex={-1}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm outline-none transition-colors',
                  'focus-visible:ring-1 focus-visible:ring-white/30',
                  isActive ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white',
                )}
              >
                <span>{LABELS[locale].long}</span>
                {isActive ? (
                  <Check size={15} aria-hidden className="shrink-0 text-violet-400" />
                ) : (
                  <span aria-hidden className="text-xs font-medium text-zinc-500">
                    {LABELS[locale].short}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
