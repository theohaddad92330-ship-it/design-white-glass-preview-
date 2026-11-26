'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterBar } from '@/ui'
import { readFilterFromSearch, withFilterInSearch } from '@/ui/FilterBar.logic'
import { ECRAN_TOUS, type EcranFilterOption } from './feedback-ecran-filter.logic'

/**
 * #1673.3 — LE FILTRE « ÉCRAN CONCERNÉ » de `/feedback`, absent avant ce lot.
 * Réutilise `FilterBar` (#1673.1) plutôt qu'un mécanisme à soi : l'état vit
 * dans l'URL (`?ecran=…`, #1673.2), à côté de `?state=` et `?vue=` déjà posés
 * par les onglets et le bascule de vue de `page.tsx`, qui restent des `<Link>`
 * SERVEUR inchangés — ce composant ajoute une DIMENSION, il n'en migre aucune.
 *
 * ⚠️ FRANÇAIS SEUL, À DESSEIN. `/feedback` n'a jamais été bilingue (aucun
 * `getLang()`/`makeT()` dans ce dossier — contrairement à `/monitoring` et
 * `/queues`, où `src/lib/i18n.ts` couvre l'écran ENTIER). Traduire seulement
 * ce filtre créerait un écran moitié FR moitié EN selon un cookie que cette
 * page ne lit même pas — une régression pire que rester cohérent avec le
 * reste du fichier. Bilinguer `/feedback` est un lot à part entière.
 */
export function FeedbackEcranFilter({ options }: { options: EcranFilterOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const allowed = options.map(o => o.key)
  const actif = readFilterFromSearch(searchParams.toString(), 'ecran', allowed, ECRAN_TOUS)

  function setEcran(next: string): void {
    const cle = allowed.includes(next) ? next : ECRAN_TOUS
    const qs = withFilterInSearch(searchParams.toString(), 'ecran', cle, ECRAN_TOUS)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Un seul écran connu (ou aucun) : rien à filtrer, la pilule serait seule.
  if (options.length <= 2) return null

  return (
    <FilterBar
      pills={options.map(o => ({ key: o.key, label: o.label, count: o.count }))}
      activeKey={actif}
      defaultKey={ECRAN_TOUS}
      onSelect={setEcran}
      onClear={() => setEcran(ECRAN_TOUS)}
      labels={{ clear: 'Réinitialiser le filtre', advanced: 'Filtres avancés' }}
    />
  )
}
