'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FilterBar } from '@/ui'

type FilterLabels = {
  search: string
  searchPlaceholder: string
  status: string
  allStatuses: string
  from: string
  to: string
  apply: string
  reset: string
  statusOptions: Array<{ value: string; label: string }>
}

/** Clé de PILULE pour « tous les statuts ». Jamais écrite dans l'URL : la
 *  chaîne vide reste la valeur RÉELLE que `runs-panel.tsx` (hors périmètre
 *  de ce lot) lit crue depuis `searchParams.status` — cette clé n'existe
 *  que pour que `FilterBar` ait un `key` React non vide à afficher. */
const TOUS_LES_STATUTS = '__tous__'

/**
 * #1673.3 — CETTE implémentation DIVERGENTE migre vers `FilterBar` (#1673.1),
 * le seul composant de filtre du back-office — GA-26, un réglage vit à un
 * seul endroit. Avant ce lot : un `<select>` HTML + deux `<input type=date>`
 * + un bouton « Filtrer », propres à cet écran, à côté des pilules déjà
 * utilisées par `/revenus/clients` et `/users`.
 *
 * ⚠️ CE COMMENTAIRE, dans `FilterBar.tsx`, DISAIT que migrer cet écran « en
 * dehors du périmètre de #1673 » casserait « son rendu 100 % serveur ». C'est
 * FAUX pour CE fichier : `filters.tsx` a TOUJOURS été un composant CLIENT
 * (`'use client'`, `useState`, `useRouter`), comme `ClientsTable`/
 * `UsersTable`. Ce qui reste serveur, c'est `RunsPanel` (`runs-panel.tsx`,
 * HORS périmètre de ce lot) : il refait sa requête à l'API à CHAQUE
 * changement d'URL, exactement comme avant — ce composant ne fait qu'écrire
 * dans l'URL différemment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PILULES POUR LE STATUT, PANNEAU AVANCÉ POUR LE RESTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le statut est un choix FERMÉ (5 valeurs + « tous ») : une pilule par
 * valeur, comme `ClientsTable`/`UsersTable`. La recherche libre et les deux
 * dates n'ont pas cette forme — elles vivent dans le panneau « Filtres
 * avancés » de `FilterBar` (≤ 6 champs, ici 3 sur 3).
 *
 * ⚠️ AUCUN compte sur les pilules de statut (`count: null` partout) : ce
 * composant ne connaît pas la répartition par statut — seul `RunsPanel`, qui
 * a déjà appliqué le filtre côté serveur, la connaît, et il est HORS
 * périmètre. Afficher un compte ici serait soit faux, soit une seconde
 * requête pour l'obtenir — aucune des deux options n'est faite ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'APPLICATION EST IMMÉDIATE, PAS UN FORMULAIRE À SOUMETTRE
 * ─────────────────────────────────────────────────────────────────────────
 * L'ancien bouton « Filtrer » soumettait les QUATRE champs en un geste.
 * `FilterBar` n'a pas cette notion — chaque pilule s'applique au clic,
 * partout ailleurs dans ce dépôt. Ici : une pilule de statut s'applique
 * immédiatement (avec la recherche/les dates DÉJÀ tapées) ; la recherche
 * s'applique à la perte de focus ou sur Entrée ; une date s'applique à son
 * `onChange` (un sélecteur de date natif ne déclenche pas ça par frappe).
 * `labels.apply` (« Filtrer ») devient donc le texte du bouton qui OUVRE le
 * panneau avancé, plutôt que de disparaître : ce dépôt ne peut pas ajouter
 * un libellé neuf ici, `runs-panel.tsx` (hors périmètre) construit `labels`
 * en entier depuis `src/lib/i18n.ts` et ne fournirait pas une clé neuve.
 *
 * ⚠️ LIMITE CONNUE, ASSUMÉE : le bouton « Effacer » intégré à `FilterBar` ne
 * réagit qu'au statut (sa seule pilule) — s'il reste au défaut pendant que la
 * recherche ou une date est renseignée, `FilterBar` ne le sait pas et ne
 * l'affiche pas. Le lien « Réinitialiser » ci-dessous, ajouté À CÔTÉ (pas
 * dans) `FilterBar`, couvre ce cas sans élargir le composant à une notion de
 * dirtiness qu'il ne porte pas ailleurs.
 */
export function Filters({
  initial,
  labels,
}: {
  initial: { search: string; status: string; from: string; to: string }
  labels: FilterLabels
}) {
  const router = useRouter()
  const [search, setSearch] = useState(initial.search)
  const [status, setStatus] = useState(initial.status)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)

  function pushUrl(next: { search: string; status: string; from: string; to: string }): void {
    const qs = new URLSearchParams()
    qs.set('view', 'runs')
    if (next.search.trim()) qs.set('search', next.search.trim())
    if (next.status) qs.set('status', next.status)
    // Les champs `date` sont `YYYY-MM-DD` ; élargis à un instant ISO que
    // l'API accepte — comportement IDENTIQUE à avant ce lot.
    if (next.from) qs.set('from', new Date(`${next.from}T00:00:00Z`).toISOString())
    if (next.to) qs.set('to', new Date(`${next.to}T23:59:59Z`).toISOString())
    router.push(`/monitoring?${qs.toString()}`)
  }

  function choisirStatut(pilule: string): void {
    const reel = pilule === TOUS_LES_STATUTS ? '' : pilule
    setStatus(reel)
    pushUrl({ search, status: reel, from, to })
  }

  function reset(): void {
    setSearch('')
    setStatus('')
    setFrom('')
    setTo('')
    router.push('/monitoring?view=runs')
  }

  const filtreAvanceActif = Boolean(search.trim() || from || to)

  return (
    <div style={{ margin: '12px 0 20px' }}>
      <FilterBar
        pills={[
          { key: TOUS_LES_STATUTS, label: labels.allStatuses, count: null },
          ...labels.statusOptions.map(o => ({ key: o.value, label: o.label, count: null })),
        ]}
        activeKey={status || TOUS_LES_STATUTS}
        defaultKey={TOUS_LES_STATUTS}
        onSelect={choisirStatut}
        onClear={() => choisirStatut(TOUS_LES_STATUTS)}
        advanced={[
          {
            key: 'search',
            label: labels.search,
            control: (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onBlur={() => pushUrl({ search, status, from, to })}
                onKeyDown={e => {
                  if (e.key === 'Enter') pushUrl({ search, status, from, to })
                }}
                placeholder={labels.searchPlaceholder}
                style={{ minWidth: 220 }}
              />
            ),
          },
          {
            key: 'from',
            label: labels.from,
            control: (
              <input
                type="date"
                value={from}
                onChange={e => {
                  setFrom(e.target.value)
                  pushUrl({ search, status, from: e.target.value, to })
                }}
              />
            ),
          },
          {
            key: 'to',
            label: labels.to,
            control: (
              <input
                type="date"
                value={to}
                onChange={e => {
                  setTo(e.target.value)
                  pushUrl({ search, status, from, to: e.target.value })
                }}
              />
            ),
          },
        ]}
        labels={{ clear: labels.reset, advanced: labels.apply }}
      />
      {filtreAvanceActif && !status ? (
        <button
          type="button"
          className="btn-sm"
          onClick={reset}
          style={{ marginTop: 4, background: 'none', border: 0, padding: '4px 4px', textDecoration: 'underline' }}
        >
          {labels.reset}
        </button>
      ) : null}
    </div>
  )
}
