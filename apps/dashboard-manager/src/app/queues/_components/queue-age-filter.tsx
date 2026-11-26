'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterBar } from '@/ui'
import { readFilterFromSearch, withFilterInSearch } from '@/ui/FilterBar.logic'
import { AGE_BUCKET_KEYS, type AgeBucketKey } from './job-age-filter.logic'

/**
 * #1673.3 — LE FILTRE « ANCIENNETÉ » de `/queues`, absent avant ce lot. Réutilise
 * `FilterBar` (#1673.1) — le seul composant de filtre du back-office — au lieu
 * d'un troisième mécanisme à côté des onglets d'état de `page.tsx` et de la
 * sélection de file.
 *
 * ⚠️ CE COMPOSANT N'A PAS LES JOBS : les COMPTES par palier viennent du
 * SERVEUR (`page.tsx`, via `compterParAnciennete`) — la même dérivation que
 * `JobsTable` utilise pour FILTRER (`filtrerParAnciennete`), jamais recalculée
 * ici (GA-26 : une dérivation vit à un seul endroit). Ce composant ne fait que
 * l'ÉCRIRE dans l'URL ; c'est `JobsTable`, en lisant la MÊME clé `age`, qui
 * applique le filtre aux lignes qu'il rend.
 */
export function QueueAgeFilter({
  counts,
  inconnuLabel,
  labels,
}: {
  /** Un compte par palier, sur la page CHARGÉE (jamais la file entière). */
  counts: Record<AgeBucketKey, number>
  /** La phrase nommant ce qui n'a pas pu être classé — `null` = rien à dire. */
  inconnuLabel: string | null
  labels: {
    clear: string
    advanced: string
    all: string
    recent: string
    today: string
    old: string
    scope: string
    section: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const actif = readFilterFromSearch(searchParams.toString(), 'age', AGE_BUCKET_KEYS, 'tous')

  function setAge(next: string): void {
    const cle = (AGE_BUCKET_KEYS as readonly string[]).includes(next) ? (next as AgeBucketKey) : 'tous'
    const qs = withFilterInSearch(searchParams.toString(), 'age', cle, 'tous')
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div role="group" aria-label={labels.section}>
      <FilterBar
        pills={[
          { key: 'tous', label: labels.all, count: counts.tous },
          { key: 'recent', label: labels.recent, count: counts.recent },
          { key: 'aujourdhui', label: labels.today, count: counts.aujourdhui },
          { key: 'ancien', label: labels.old, count: counts.ancien },
        ]}
        activeKey={actif}
        defaultKey="tous"
        onSelect={setAge}
        onClear={() => setAge('tous')}
        labels={{ clear: labels.clear, advanced: labels.advanced }}
      />
      <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 12px' }}>
        {labels.scope}
        {inconnuLabel ? ` ${inconnuLabel}` : ''}
      </p>
    </div>
  )
}
