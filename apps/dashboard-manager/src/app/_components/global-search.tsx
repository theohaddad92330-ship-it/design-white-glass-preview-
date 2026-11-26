'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './global-search.module.css'
import { type GlobalSearchResult, type SearchCategory } from './global-search.logic'

/**
 * #1673.6 — LA RECHERCHE GLOBALE (⌘K), montée UNE FOIS dans `layout.tsx` — donc
 * accessible depuis toute page — et déclenchée soit par le raccourci clavier,
 * soit par le bouton de `side-rail.tsx` (via `openGlobalSearch()`, un
 * événement DOM plutôt qu'un contexte : le rail et cette palette sont deux
 * enfants indépendants du layout racine, aucun état commun à faire remonter).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SOURCE DES RÉSULTATS
 * ─────────────────────────────────────────────────────────────────────────────
 * `search` est une Server Action définie dans `layout.tsx` (Composant Serveur),
 * qui compose `runGlobalSearch` (`global-search.logic.ts`) sur les endpoints
 * que le manager appelle déjà (`lib/admin.ts`, `lib/monitoring.ts`). Aucun
 * nouvel endpoint sous `app/api/**` — hors du périmètre de ce lot, et une
 * Server Action ne demande pas d'en ajouter un.
 *
 * ⚠️ « Un email tapé en entier va DIRECTEMENT à la fiche » : dès que
 * `result.directEmailUserId` répond, on NAVIGUE — cet email n'apparaît jamais
 * dans la liste ci-dessous (masquée ou non).
 */

export type GlobalSearchLabels = {
  triggerLabel: string
  placeholder: string
  loading: string
  noResults: string
  close: string
  groups: Record<SearchCategory, string>
}

const OPEN_EVENT = 'bellum:global-search:open'
const DEBOUNCE_MS = 200
const EMPTY_RESULT: GlobalSearchResult = { groups: [], directEmailUserId: null }

/** Le déclencheur (`side-rail.tsx`) n'a pas accès à l'état de ce composant —
 *  il ouvre la palette via cet événement DOM plutôt qu'un contexte partagé. */
export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function GlobalSearch({
  labels,
  search,
}: {
  labels: GlobalSearchLabels
  search: (query: string) => Promise<GlobalSearchResult>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<GlobalSearchResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  // Une réponse qui arrive après une frappe plus récente ne doit JAMAIS
  // écraser un résultat plus à jour.
  const requestId = useRef(0)

  /**
   * ⚠️⚠️ MESURÉ EN PRODUCTION LE 09/09/2026 — la palette appelait le serveur
   * EN BOUCLE, environ une fois par seconde, tant qu'elle restait ouverte.
   *
   * Le mécanisme : l'effet de recherche dépendait de `search`, une PROP.
   * Chaque résolution appelait `setResult`, donc un rendu, donc un effet qui
   * se relance, donc `setLoading(true)` et une nouvelle recherche — sans fin.
   * Cinq endpoints d'administration par tour, contre la production.
   *
   * Ce que ça donnait à l'écran : « Recherche… » affiché POUR TOUJOURS,
   * même résultats en place. Le symptôme visible était un libellé qui traîne ;
   * le vrai coût était invisible.
   *
   * La prop vit donc dans une référence : l'effet ne dépend plus que de ce qui
   * doit VRAIMENT le relancer — la requête, et l'ouverture de la palette.
   */
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  }, [search])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResult(EMPTY_RESULT)
  }, [])

  // ⌘K / Ctrl+K, sur toute page — ce composant est monté une seule fois, dans
  // le layout racine.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onOpenEvent(): void {
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpenEvent)
    return () => window.removeEventListener(OPEN_EVENT, onOpenEvent)
  }, [])

  // L'anneau de focus ne se supprime jamais sans remplacement : à l'ouverture,
  // il va dans le champ ; à la fermeture, il REVIENT sur ce qui l'avait avant
  // (le déclencheur, le plus souvent).
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      inputRef.current?.focus()
    } else {
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  // Échap ferme toute modale.
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closePalette()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closePalette])

  // Debounce + garde anti-réponse-tardive.
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResult(EMPTY_RESULT)
      setLoading(false)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    const timer = setTimeout(() => {
      void searchRef
        .current(trimmed)
        .then(next => {
          if (id === requestId.current) {
            setResult(next)
            setLoading(false)
          }
        })
        .catch(() => {
          if (id === requestId.current) {
            setResult(EMPTY_RESULT)
            setLoading(false)
          }
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, open])

  // #1673.6 — le chemin direct. Cet email n'a jamais été rendu dans la liste.
  useEffect(() => {
    const userId = result.directEmailUserId
    if (!userId) return
    closePalette()
    router.push(`/users/${encodeURIComponent(userId)}`)
  }, [result.directEmailUserId, closePalette, router])

  if (!open) return null

  const trimmed = query.trim()
  const showNoResults = !loading && trimmed.length > 0 && result.groups.length === 0 && !result.directEmailUserId

  return (
    <div className={styles['backdrop']} onMouseDown={closePalette}>
      <div
        className={styles['panel']}
        role="dialog"
        aria-modal="true"
        aria-label={labels.triggerLabel}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className={styles['inputRow']}>
          <span className={styles['inputIcon']} aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className={styles['input']}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
          />
          <button type="button" className={styles['closeButton']} onClick={closePalette} aria-label={labels.close}>
            ✕
          </button>
        </div>

        <div className={styles['results']}>
          {loading ? <p className={styles['status']}>{labels.loading}</p> : null}
          {showNoResults ? <p className={styles['status']}>{labels.noResults}</p> : null}
          {result.groups.map(group => (
            <div key={group.category} className={styles['group']}>
              <p className={styles['groupLabel']}>{labels.groups[group.category]}</p>
              <ul className={styles['groupList']}>
                {group.hits.map(hit => (
                  <li key={`${group.category}-${hit.id}`}>
                    <a className={styles['hit']} href={hit.href} onClick={closePalette}>
                      <span className={styles['hitTitle']}>{hit.title}</span>
                      {hit.subtitle ? <span className={styles['hitSubtitle']}>{hit.subtitle}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
