import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from '@bellum/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { WatchSignal } from '@/features/accounts/model/watch'

export type WatchFilter = 'all' | 'recruitments' | 'projects' | 'purchases' | 'organization'
type WatchSort = 'recent' | 'importance'

/**
 * #2119.15 / #2119.16 — LA FENÊTRE D'ÂGE, et pourquoi elle n'est PAS dans la
 * barre d'onglets au-dessus.
 *
 * Le retour demande « Récent » et « Contexte ancien » à côté des autres
 * filtres. Les mettre dans la même liste les rendrait EXCLUSIFS des catégories :
 * on ne pourrait plus demander « les recrutements, et seulement les récents »,
 * alors que c'est exactement la question qu'on se pose. Deux axes indépendants,
 * donc deux contrôles — et ils se composent.
 *
 * ⚠️ CE QUE CE FILTRE MESURE VRAIMENT, et ce qu'il ne promet pas. Le produit ne
 * porte AUCUNE fenêtre en jours : `signal.date` est une chaîne libre qui peut
 * être « 2026 », « mars 2026 » ou un libellé d'absence, et un filtre « les N
 * derniers jours » bâti dessus écarterait en silence des signaux qu'il ne sait
 * pas lire. Ce qui EST mesuré est `freshness`, la classe d'âge déterministe que
 * l'analyse estampille (`current` / `archive` / `undated`, l'archive au-delà
 * d'environ 24 mois) — et c'est elle qu'on filtre. Les libellés le disent :
 * « Signaux actuels », pas « les 30 derniers jours ».
 */
type WatchAge = 'any' | 'current' | 'archive'

const FILTERS: WatchFilter[] = ['all', 'recruitments', 'projects', 'purchases', 'organization']

type WatchFiltersProps = {
  signals: WatchSignal[]
  children: (state: {
    activeCategory: WatchFilter
    filteredSignals: WatchSignal[]
    narrowed: boolean
    /** #3680.2 — un compteur ouvre sa liste : il pose la catégorie qu'il nomme. */
    openCategory: (filter: WatchFilter) => void
  }) => ReactNode
}

export function WatchFilters({ signals, children }: WatchFiltersProps) {
  const { t } = useTranslation('accountWatch')
  const [activeCategory, setActiveCategory] = useState<WatchFilter>('all')
  const [age, setAge] = useState<WatchAge>('any')
  const [sort, setSort] = useState<WatchSort>('recent')
  const filteredSignals = useMemo(
    () =>
      sortSignals(
        signals.filter(signal => matchesFilter(signal, activeCategory) && matchesAge(signal, age)),
        sort,
      ),
    [activeCategory, age, signals, sort],
  )
  // La liste est-elle RESSERRÉE ? La question ne se réduit plus à la catégorie :
  // un vide obtenu par la fenêtre d'âge doit se lire « rien ne correspond à ce
  // filtre », pas « ce compte n'a aucun signal ».
  const narrowed = activeCategory !== 'all' || age !== 'any'

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Tabs value={activeCategory} onValueChange={value => setActiveCategory(value as WatchFilter)}>
            <TabsList className="w-max">
              {FILTERS.map(filter => (
                <TabsTrigger key={filter} value={filter}>
                  {/* i18n keys: filters.all | filters.recruitments | filters.projects | filters.purchases | filters.organization */}
                  {t(`filters.${filter}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <WatchAgeSelect value={age} onValueChange={setAge} />
          <WatchSortSelect value={sort} onValueChange={setSort} />
        </div>
      </div>
      {children({ activeCategory, filteredSignals, narrowed, openCategory: setActiveCategory })}
    </div>
  )
}

/**
 * #2119.15 / #2119.16 — le sélecteur de fenêtre. Trois états, et le troisième
 * est le défaut : ne rien écarter tant que personne ne l'a demandé.
 *
 * ⚠️ Un signal `undated` n'est NI actuel NI archive — il ne sort donc sous
 * aucun des deux filtres, et c'est volontaire : le ranger d'office dans l'un des
 * deux lui inventerait un âge. Il reste visible sous « Toutes périodes ».
 */
function WatchAgeSelect({ value, onValueChange }: { value: WatchAge; onValueChange: (value: WatchAge) => void }) {
  const { t } = useTranslation('accountWatch')
  return (
    <Select value={value} onValueChange={next => onValueChange(next as WatchAge)}>
      <SelectTrigger aria-label={t('filters.ageAriaLabel')} className="h-9 w-40 shrink-0 rounded-md">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="any">{t('filters.ageAny')}</SelectItem>
        <SelectItem value="current">{t('filters.ageCurrent')}</SelectItem>
        <SelectItem value="archive">{t('filters.ageArchive')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

function WatchSortSelect({ value, onValueChange }: { value: WatchSort; onValueChange: (value: WatchSort) => void }) {
  const { t } = useTranslation('accountWatch')
  return (
    <Select value={value} onValueChange={next => onValueChange(next as WatchSort)}>
      <SelectTrigger aria-label={t('filters.sortAriaLabel')} className="h-9 w-36 shrink-0 rounded-md">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="recent">{t('filters.sortRecent')}</SelectItem>
        <SelectItem value="importance">{t('filters.sortImportance')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

// #2617.1 — les quatre onglets regroupent les SIX catégories métier de Simon :
// Achats prend les trois genres d'argent (budget, appel d'offres, marché
// public — un acheteur public n'a ni le même calendrier ni le même
// interlocuteur qu'un privé, mais les DEUX restent des « achats » pour ce
// regroupement), Organisation prend la nomination (un nouveau contact à
// approcher), et le reste (« historique ») garde l'onglet Opportunités par
// défaut — jamais un signal compris qui disparaît d'un onglet.
function matchesFilter(signal: WatchSignal, filter: WatchFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'recruitments') return signal.category === 'recrutement'
  if (filter === 'purchases') {
    return signal.category === 'budget' || signal.category === 'appel_offres' || signal.category === 'marche_public'
  }
  if (filter === 'organization') return signal.category === 'nomination'
  return signal.category === 'historique'
}

/** La classe d'âge est LUE, jamais recalculée depuis la date : `freshness` est
 *  estampillée par l'analyse, et une seconde dérivation divergerait. */
function matchesAge(signal: WatchSignal, age: WatchAge): boolean {
  if (age === 'any') return true
  return signal.freshness === age
}

// #4715 — « Plus importants » trie sur l'IMPORTANCE à trois niveaux que le
// produit calcule déjà (`signalImportance`, @bellum/contracts) : actif et sourcé,
// actif sans source, archivé. Il n'existe AUCUN score numérique par signal — l'ancien
// tri lisait `score ?? 0`, un champ que rien ne remplit, et ne triait rien. Un
// signal sans importance (âge inconnu) passe APRÈS les trois niveaux : on ne lui en
// devine pas une. `Array.sort` est stable : à importance égale, l'ordre d'entrée reste.
const IMPORTANCE_RANK = { high: 0, medium: 1, low: 2 } as const
const UNRANKED = 3

function importanceRank(signal: WatchSignal): number {
  return signal.importance ? IMPORTANCE_RANK[signal.importance] : UNRANKED
}

function sortSignals(signals: WatchSignal[], sort: WatchSort): WatchSignal[] {
  if (sort === 'importance') return [...signals].sort((left, right) => importanceRank(left) - importanceRank(right))
  return signals
}
