import { cn } from '@bellum/ui'
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useShortcutLabel } from '@/features/shortcuts/shortcut-format'
import { isTypingTarget, shortcutById } from '@/features/shortcuts/shortcuts'
import { searchDossier, type DossierSearchItem, type DossierSearchResult } from './dossierSearch'

interface DossierSearchProps {
  accountId: string
  companyName: string
  items: readonly DossierSearchItem[]
  /** La requête vit dans l'URL (`?find=`), pas ici : un retour navigateur la
   *  restaure (#2128.53). Le composant est contrôlé. */
  query: string
  onQueryChange: (next: string) => void
  onOpen: (result: DossierSearchResult) => void
  onPrepareAction: () => void
  onAddWhatIKnow: () => void
}

/**
 * #2128.31 — LE CHAMP DE RECHERCHE DU DOSSIER, COMPACT.
 *
 * Le panneau s'affiche EN LIGNE sous le champ, pas en surimpression : sur
 * mobile, une surimpression défilante dans une page qui défile est deux
 * conteneurs défilants imbriqués (GA-29). Vingt résultats au plus, donc rien à
 * faire défiler dedans.
 */
export function DossierSearch({
  accountId,
  companyName,
  items,
  query,
  onQueryChange,
  onOpen,
  onPrepareAction,
  onAddWhatIKnow,
}: DossierSearchProps) {
  const { t, i18n } = useTranslation('accounts')
  const shortcut = shortcutById('dossier-search')
  const shortcutLabel = useShortcutLabel(shortcut)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [open, setOpen] = useState(false)

  // #2128.61 — en mémoire, à chaque frappe : aucun appel réseau, aucun rechargement.
  const results = useMemo(() => searchDossier(items, query), [items, query])
  const hasQuery = query.trim().length > 0

  // #2128.32 / #2128.59 — « / » met le curseur dans la recherche. Jamais pendant
  // une saisie, jamais avec un modificateur (⌘/ reste l'aide des raccourcis).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      // #3648 — la cible OU l'élément actif (le focus peut précéder l'événement au montage).
      if (event.key !== shortcut.keys[0] || isTypingTarget(event.target) || isTypingTarget(document.activeElement))
        return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcut])

  const focusResult = (index: number) => {
    if (index < 0) {
      inputRef.current?.focus()
      return
    }
    resultRefs.current[Math.min(index, results.length - 1)]?.focus()
  }

  const onFieldKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (hasQuery) onQueryChange('')
      else {
        setOpen(false)
        inputRef.current?.blur()
      }
    } else if (event.key === 'Enter' && results[0]) {
      event.preventDefault()
      onOpen(results[0])
    } else if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault()
      focusResult(0)
    }
  }

  const onResultKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusResult(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusResult(index - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      focusResult(-1)
    }
  }

  const formatDate = (date: string): string | null => {
    const time = Date.parse(date)
    return Number.isNaN(time) ? null : new Date(time).toLocaleDateString(i18n.language)
  }

  return (
    <div
      role="search"
      aria-label={t('dossierSearch.region')}
      className="flex min-w-0 flex-col gap-2"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <div className="relative w-full md:max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--bellum-text-muted)]"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onFieldKeyDown}
          aria-label={t('dossierSearch.label')}
          aria-keyshortcuts={shortcut.keys[0]}
          title={t('dossierSearch.shortcutHint', { keys: shortcutLabel })}
          placeholder={t('dossierSearch.placeholder')}
          className={cn(
            'min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] py-2 pl-9 pr-10 text-sm',
            'text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]',
            '[&::-webkit-search-cancel-button]:hidden',
          )}
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => {
              onQueryChange('')
              inputRef.current?.focus()
            }}
            aria-label={t('dossierSearch.clear')}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {/* #2128.56-58 — champ vide : les raccourcis d'action du dossier. Ils ne
          s'affichent qu'à la demande (focus), jamais en permanence : l'entête
          porte déjà l'action principale, rien n'apparaît deux fois (loi 4). */}
      {open && !hasQuery && (
        <div
          role="group"
          aria-label={t('dossierSearch.quickActions')}
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          <AskLaura
            question={t('dossierSearch.askLauraQuestion', { company: companyName })}
            label={t('dossierSearch.askLaura')}
            accountId={accountId}
          />
          <button
            type="button"
            onClick={onPrepareAction}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
          >
            {t('dossierSearch.prepareAction')}
          </button>
          <button
            type="button"
            onClick={onAddWhatIKnow}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
          >
            {t('dossierSearch.addWhatIKnow')}
          </button>
        </div>
      )}

      {hasQuery && (
        <div className="flex flex-col gap-2">
          {results.length > 0 ? (
            <ul
              aria-label={t('dossierSearch.results')}
              className="flex flex-col divide-y divide-[var(--bellum-border)] rounded-md border border-[var(--bellum-border)]"
            >
              {results.map((result, index) => {
                const formatted = result.date ? formatDate(result.date) : null
                return (
                  <li key={`${result.kind}:${result.id}`}>
                    <button
                      type="button"
                      ref={node => {
                        resultRefs.current[index] = node
                      }}
                      onClick={() => onOpen(result)}
                      onKeyDown={event => onResultKeyDown(event, index)}
                      className="flex min-h-11 w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--bellum-surface-2)] focus-visible:bg-[var(--bellum-surface-2)]"
                    >
                      {/* #2128.44 — le type */}
                      <span className="mt-0.5 shrink-0 rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]">
                        {t(`dossierSearch.kinds.${result.kind}`)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        {/* #2128.45 — le libellé */}
                        <span className="truncate text-sm font-medium text-[var(--bellum-text-primary)]">
                          {result.label}
                        </span>
                        {/* #2128.46 — le contexte, seulement s'il existe */}
                        {result.context && (
                          <span className="truncate text-xs text-[var(--bellum-text-secondary)]">{result.context}</span>
                        )}
                        {/* #2128.48 — la section et sa sous-partie ; #2128.47 — la date, jamais inventée */}
                        <span className="text-xs text-[var(--bellum-text-muted)]">
                          {t('dossierSearch.where', {
                            section: t(`tabSections.${result.section}`),
                            subSection: t(`tabs.${result.tab}`),
                          })}
                          {formatted && result.date && (
                            <>
                              {' · '}
                              <time dateTime={result.date}>{formatted}</time>
                            </>
                          )}
                        </span>
                      </span>
                      {/* #2128.49 — l'action directe */}
                      <span className="shrink-0 text-xs font-medium text-[var(--bellum-text-accent)]">
                        {t('dossierSearch.open')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--bellum-text-secondary)]">{t('dossierSearch.empty', { query })}</p>
          )}
          {/* #2128.33 — ce que la recherche ne trouve pas, Laura peut le chercher. */}
          <AskLaura
            question={t('dossierSearch.askLauraAboutQuestion', { query: query.trim(), company: companyName })}
            label={t('dossierSearch.askLauraAbout')}
            accountId={accountId}
          />
        </div>
      )}
    </div>
  )
}
