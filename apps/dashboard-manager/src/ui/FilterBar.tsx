'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Pill } from './Pill'
import styles from './FilterBar.module.css'
import {
  capAdvancedFilters,
  formatPillLabel,
  isDirty,
  type AdvancedFilterDef,
  type FilterPillDef,
} from './FilterBar.logic'

/**
 * #1673.1 — LE composant de filtre unique du back-office : des pilules, un
 * compteur par pilule, un bouton « Effacer », et un panneau « Filtres
 * avancés » (≤ 6 champs, `FilterBar.logic.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce composant ne sait pas OÙ vit l'état du filtre actif (URL, `useState`…) —
 * c'est l'appelant qui le décide via `activeKey`/`onSelect`. `clients-table.tsx`,
 * `users-table.tsx`, `queues/_components/queue-age-filter.tsx`,
 * `feedback/_components/feedback-ecran-filter.tsx` et
 * `monitoring/_components/filters.tsx` l'utilisent avec l'URL comme source de
 * vérité (#1673.2, `FilterBar.logic.ts` → `withFilterInSearch` /
 * `readFilterFromSearch`).
 *
 * ⚠️ CE PARAGRAPHE DISAIT « `queues/page.tsx`, `monitoring/_components/
 * filters.tsx` et `audit/_components/audit-filtres.tsx` restent EN DEHORS de
 * ce lot » — vrai au moment où #1673.1 l'a écrit (hors périmètre de fichiers
 * à l'époque), FAUX depuis que #1673.3 a ouvert ce périmètre : les DEUX
 * premiers utilisent désormais `FilterBar` (le filtre « ancienneté » de
 * `/queues` vit dans `queue-age-filter.tsx`, pas dans `page.tsx` lui-même,
 * qui reste server-only ; `monitoring/_components/filters.tsx` a migré son
 * `<select>`+dates vers pilules+panneau avancé). Seul `audit-filtres.tsx`
 * reste en dehors, et pour une raison NOMMÉE dans son propre fichier — pas
 * un oubli de périmètre : il rend des `<a href>` pour rester server-only et
 * bookmarkable, un choix que `FilterBar` (`'use client'`, des `<button>`)
 * ne peut pas porter sans devenir un composant à deux modes pour un appelant
 * unique.
 */
export function FilterBar({
  pills,
  activeKey,
  defaultKey,
  onSelect,
  onClear,
  advanced,
  labels,
}: {
  pills: FilterPillDef[]
  activeKey: string
  defaultKey: string
  onSelect: (key: string) => void
  onClear: () => void
  /** ≤ 6 champs (`FilterBar.logic.ts`). Le contrôle (input/select/date…)
   *  appartient à l'appelant — ce composant ne connaît que le libellé. */
  advanced?: (AdvancedFilterDef & { control: ReactNode })[]
  labels: { clear: string; advanced: string }
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { fields } = capAdvancedFilters(advanced ?? [])
  const dirty = isDirty(activeKey, defaultKey)

  // Échap ferme toute modale — le panneau avancé n'en est pas une, mais la
  // même attente vaut pour tout ce qui se déplie par-dessus le contenu.
  useEffect(() => {
    if (!advancedOpen) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setAdvancedOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advancedOpen])

  return (
    <div className={styles['bar']}>
      <div className={styles['row']}>
        {pills.map(pill => (
          <Pill key={pill.key} active={pill.key === activeKey} onClick={() => onSelect(pill.key)}>
            {formatPillLabel(pill)}
          </Pill>
        ))}

        {dirty ? (
          <button type="button" className={styles['clear']} onClick={onClear}>
            {labels.clear}
          </button>
        ) : null}

        {fields.length > 0 ? (
          <button
            type="button"
            className={styles['advancedToggle']}
            aria-expanded={advancedOpen}
            aria-controls="filterbar-advanced-panel"
            onClick={() => setAdvancedOpen(open => !open)}
          >
            {labels.advanced}
            <span aria-hidden="true">{advancedOpen ? ' ▾' : ' ▸'}</span>
          </button>
        ) : null}
      </div>

      {fields.length > 0 ? (
        <div id="filterbar-advanced-panel" className={styles['advanced']} hidden={!advancedOpen}>
          {fields.map(field => (
            <label key={field.key} className={styles['advancedField']}>
              <span className={styles['advancedLabel']}>{field.label}</span>
              {field.control}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
