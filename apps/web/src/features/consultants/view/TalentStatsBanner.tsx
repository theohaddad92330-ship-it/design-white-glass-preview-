import { ENRICHED_MIN_AXES, talentAvailabilityMeasure, type TalentStats } from '@bellum/contracts'
import { Clock, FileCheck, FileWarning, Star, Users } from 'lucide-react'
import { FilterChips } from '@bellum/ui'
import type { TalentSearchQuery } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { Completeness } from '@/components/primitives/Completeness'
import { KeyFigureRow, type KeyFigure } from '@/components/primitives/KeyFigureRow'
import { useTalentStats } from '../hooks'

/**
 * Le bandeau de statistiques du vivier (écran Vivier, PDF-22 §01).
 *
 * ⚠️ AUCUN chiffre ne s'invente. La maquette montre une tendance (« +8% ce
 * mois ») sous le total — REVU le 31/08/2026, second lot, à la lumière de la
 * photo mensuelle qui vient d'arriver (`StockSnapshotService.seriesFor()` +
 * `metricDelta()`, `@bellum/contracts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LA TUILE LE DIT, PLUTÔT QUE DE SE TAIRE
 * ─────────────────────────────────────────────────────────────────────────
 * La photo existe pour NEUF indicateurs (`STOCK_METRIC_KEYS`), et AUCUN
 * n'est la population d'une des cinq tuiles de ce bandeau :
 *
 *  - le total (`stats.total` = consultants + candidats, non archivés)
 *    n'est photographié NULLE PART — la requête qui s'en approche le plus
 *    (`pilotageService.gatherInputs`, `benchRow.total`) calcule un `total`
 *    puis le JETTE (`pushableBench` ne rend que `bench`) ;
 *  - « Disponibles maintenant » (`stats.availableNow`) est la disponibilité
 *    DÉRIVÉE des affectations (`deriveStaffing`, §6.2 — la raison d'être de
 *    ce lot). Le SEUL indicateur photographié qui s'en approche,
 *    `benchAvailable`, compte le DÉCLARATIF
 *    (`consultants.availability IN ('immediate','sous_1_mois')`),
 *    justement ce que §6.2 interdit de réhabiliter. Une trend calculée sur
 *    l'un et affichée sous l'autre serait EXACTEMENT le défaut que ce lot
 *    corrige ailleurs sur cet écran — deux définitions de « disponible »
 *    sur la même tuile, invérifiables l'une contre l'autre ;
 *  - « Profils enrichis », « Profils favoris » et « Mis à jour » n'ont
 *    aucun équivalent photographié.
 *
 * Forcer l'un des neuf indicateurs sous une tuile qui mesure autre chose
 * aurait été un chiffre TECHNIQUEMENT réel et FAUX pour la question posée —
 * pire qu'un chiffre absent. La tuile du TOTAL — celle que la maquette montre
 * avec une tendance — porte donc `<TrendLine trend={{ state: 'stock' }} />` :
 * LE rendu du dépôt pour « cet indicateur n'a et n'aura jamais d'historique »
 * (`trend.stock` = « état courant, sans historique »), plutôt qu'un silence
 * qu'un lecteur ne distinguerait pas d'un oubli. Ajouter un DIXIÈME
 * indicateur (un vrai `talents_total`, sur la MÊME population que
 * `stats.total`) à `STOCK_METRIC_KEYS` (`packages/contracts/src/schemas/
 * stock-snapshot.ts`) ferait basculer cette tuile sur `state: 'measured'` —
 * c'est là, et nulle part ailleurs, que le delta se branche. Les quatre
 * autres tuiles n'en portent aucune : la maquette ne montre de tendance que
 * sur le total, et leur en inventer une romprait la même règle une deuxième
 * fois. Chaque tuile qui reste est un compte RÉEL, sur TOUT l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1839 — « DISPONIBLES MAINTENANT : 0 » ÉTAIT UN ZÉRO ORPHELIN
 * ─────────────────────────────────────────────────────────────────────────
 * `stats.availableNow` compte des fiches PROUVÉES libres (un historique
 * d'affectations existe, aucune ne court aujourd'hui). Il ne dit RIEN des
 * fiches qui n'ont AUCUNE affectation enregistrée : pour elles,
 * `deriveStaffing` rend `unknown` — ni « disponible » ni « occupé », « je ne
 * sais pas ». Un lecteur qui voit « 0 » sans ce compagnon conclut « tout le
 * monde est occupé », alors que la vérité peut être « personne n'a jamais
 * saisi d'affectation ». Même doctrine que `AccountResourceMeasure`
 * (`laura-account-context.ts:64-70`) : « un chiffre orphelin rassure
 * toujours ».
 *
 * `stats.availabilityUnknownCount` est donc rendu SOUS le nombre, sur la
 * MÊME population (`decorated`, côté serveur — voir `talent.service.ts:stats`)
 * — jamais le compteur DÉCLARATIF de la pastille d'hygiène du dessous
 * (`ConsultantsPage.tsx`, `check="talents_unknown_availability"`), qui ne
 * porte QUE sur les consultants (`kind = 'consultant'`) alors que ce total
 * inclut aussi les candidats : l'emprunter aurait qualifié un nombre avec la
 * population d'un AUTRE nombre — exactement le défaut que ce lot corrige.
 *
 * `0` reste un vrai zéro tant que `availabilityUnknownCount` est lui-même à
 * `0` (toute la population a un historique d'affectations, mesurable) : la
 * mention ne s'affiche donc QUE quand elle change la lecture du chiffre.
 *
 * ⚠️ SECOND TOUR (#1839) — LE COMPAGNON SEUL LAISSAIT LE CHIFFRE NU.
 *
 * Mesuré en production le 10/09/2026, une fois le compagnon en ligne :
 *
 *     Disponibles maintenant · 0 · 20 fiches sans affectation enregistrée
 *
 * sur 30 talents. Le compagnon dit ce qui manque, mais pas sur QUOI le « 0 »
 * porte : « 0 sur les 10 fiches mesurables » est VRAI, « 0 sur 30 » est FAUX,
 * et c'est le second que l'œil lit — le chiffre est grand, la mention petite.
 * Un chiffre nu se lit toujours comme une mesure complète.
 *
 * Deux rendus, pour deux situations qui ne se ressemblent pas :
 *
 *  - une part du vivier se tait → le nombre RESTE (c'est une mesure), et
 *    `<Completeness>` (GA-71, la voix du dépôt pour « calculé sur … ») dit son
 *    dénominateur et NOMME ce qui en est sorti. Le dépôt refuse une seconde
 *    version de cette phrase écrite à la main : quatre écrans l'avaient déjà
 *    recomposée, aucun ne traitait le dénominateur non lu.
 *  - TOUT le vivier se tait → il n'y a plus de dénominateur du tout, et
 *    « calculé sur 0 sur 30 » sous un grand « 0 » resterait une affirmation
 *    sur du vide. La tuile se tait alors, exactement comme sa voisine
 *    « Profils enrichis » sans talent à mesurer.
 *
 * La frontière entre « lisible et vide » (on dit zéro, c'est un fait) et
 * « illisible » (on se tait) vit dans `talentAvailabilityMeasure`
 * (`@bellum/contracts`), à un seul endroit, à côté du champ qu'elle qualifie.
 */
export function TalentStatsBanner({
  listTotal,
  query = {},
  onFilter,
  favoriteCount,
}: {
  listTotal?: number
  /** Les filtres posés : une tuile est « enfoncée » quand son filtre l'est. */
  query?: Partial<TalentSearchQuery>
  /**
   * Théo C talents-vivier.R2 — « disponibles maintenant · profils enrichis · fiches sous le seuil ·
   * favoris » sont des FILTRES CLIQUABLES (Louis, 22/10/2026, « rien ne se perd »). `undefined` = ce
   * même filtre est retiré.
   */
  onFilter?: (patch: Partial<TalentSearchQuery>) => void
  /** Mes favoris, comptés par le serveur ; `undefined` = pas encore lu (jamais « 0 »). */
  favoriteCount?: number
}) {
  const { data: stats, isLoading } = useTalentStats()

  if (isLoading || !stats) return null
  // #3488 — les pastilles mesurent le vivier ACTIF ; si la liste en dessous
  // montre des profils (archivés affichés) alors qu'elles en comptent zéro,
  // « 0 · 0 · non mesuré » contredirait la liste. Une absence ne fait aucune
  // ligne : on se tait, comme la tuile qui n'a rien à mesurer.
  if (stats.total === 0 && listTotal !== undefined && listTotal > 0) return null

  // #1839 — la même règle pour tous les lecteurs de ces deux nombres, tenue
  // dans les contrats à côté du champ qu'elle qualifie.
  const availability = talentAvailabilityMeasure(stats)

  return (
    <div className="mb-3">
      <StatPastilles
        stats={stats}
        availability={availability}
        query={query}
        onFilter={onFilter}
        favoriteCount={favoriteCount}
      />
    </div>
  )
}

/**
 * #3146 — les chiffres clés, en pastilles, toujours visibles. Icône + valeur
 * seuls (le libellé complet vit dans `aria-label`, GA-26 : jamais deux
 * rendus du même libellé). `notMeasured` tient la même frontière mesuré/non
 * mesuré que le calcul — jamais un « 0 » pour une valeur non mesurée.
 *
 * #3162 (retour bêta, 28/09/2026) — Louis : « supprime[le dépliable], et
 * ajoute les infos au hover sur les petites cases du haut ». Les cinq
 * cartes détaillées (tendance, complétude, raisons de non-mesure) qui
 * vivaient dans le `CollapsedSection` fermé par défaut disparaissent :
 * cette information NE disparaît PAS, elle se lit désormais au survol (et
 * au focus clavier — GA-32/GA-35, une infobulle jamais dans un `title=`
 * brut, invisible au clavier comme au tactile) de la pastille qui la
 * concerne. Une pastille sans détail supplémentaire (le compte de fiches
 * incomplètes, par exemple — la valeur EST déjà toute l'information) ne
 * porte aucune infobulle : une infobulle vide n'apprendrait rien.
 */
function StatPastilles({
  stats,
  availability,
  query,
  onFilter,
  favoriteCount,
}: {
  stats: TalentStats
  availability: ReturnType<typeof talentAvailabilityMeasure>
  query: Partial<TalentSearchQuery>
  onFilter?: (patch: Partial<TalentSearchQuery>) => void
  favoriteCount?: number
}) {
  const { t } = useTranslation('consultants')
  const { t: tc } = useTranslation('common')
  const notMeasured = t('stats.notMeasuredShort')

  // #1839 — la même conclusion que portait la carte : quand AUCUNE fiche n'a
  // d'affectation enregistrée, le dénominateur de la disponibilité dérivée
  // est vide et il n'y a rien à affirmer.
  //
  // #3162 — la part MESURÉE délègue à `<Completeness plain>` : MÊME
  // dérivation (`deriveCompleteness`, GA-26), MÊMES libellés — la primitive
  // reste la SEULE à les appeler (GA-71) — seul son CONTENANT change (`plain`,
  // sans le `<Popover>` que l'infobulle ne peut pas accueillir).
  const availabilityDetail =
    availability.state === 'unmeasured' ? (
      tc('unknownValue') +
      (availability.unmeasurable > 0
        ? ` — ${t('stats.availabilityAllUnknown', { count: availability.unmeasurable })}`
        : '')
    ) : (
      <Completeness
        plain
        counted={stats.total - availability.unmeasurable}
        total={stats.total}
        of={t('stats.completenessPopulation')}
        excluded={
          availability.unmeasurable > 0
            ? [t('stats.availabilityUnknownCount', { count: availability.unmeasurable })]
            : undefined
        }
      />
    )

  // F2-FIX #4332 — la MÊME rangée de chiffres clés que Comptes et Pipe (`KeyFigureRow`) : les cinq
  // chiffres du Vivier gardent leur libellé à l'écran (#3488), leur détail au survol et au focus.
  // Théo C talents-vivier.R2 — le geste d'une tuile : poser son filtre, ou le retirer s'il l'est déjà.
  const toggle = (
    id: string,
    label: string,
    active: boolean,
    on: Partial<TalentSearchQuery>,
    off: Partial<TalentSearchQuery>,
  ) =>
    onFilter ? (
      <div className="mt-1" data-testid={`talent-filter-${id}`}>
        <FilterChips
          ariaLabel={t('vivier.stats.filterAria', { label })}
          options={[{ value: id, label: t(active ? 'vivier.stats.active' : 'vivier.stats.filter') }]}
          value={active ? id : null}
          clearable
          onChange={next => onFilter(next ? on : off)}
        />
      </div>
    ) : undefined

  const figures: KeyFigure[] = [
    {
      id: 'total',
      icon: <Users className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />,
      label: t('stats.total'),
      value: String(stats.total),
      // La maquette montre « +8 % ce mois » sous cette tuile. Aucune photo mensuelle ne couvre ce total
      // (voir l'en-tête du fichier) : le dire plutôt que de se taire — `trend.stock` est LE texte du
      // dépôt pour « pas d'historique, et il n'y en aura jamais un sans un dixième indicateur ».
      detail: tc('trend.stock'),
    },
    {
      id: 'availableNow',
      icon: <Clock className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />,
      label: t('stats.availableNow'),
      value: availability.state === 'unmeasured' ? notMeasured : String(availability.availableNow),
      tone: availability.state === 'unmeasured' ? 'muted' : 'neutral',
      detail: availabilityDetail,
      action: toggle(
        'available',
        t('stats.availableNow'),
        query.derived === 'available',
        { derived: 'available' },
        { derived: undefined },
      ),
    },
    {
      id: 'enriched',
      icon: <FileCheck className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />,
      label: t('stats.enrichedPercent'),
      value: String(stats.total - stats.incompleteCount),
      detail: t('stats.enrichedThreshold', { min: ENRICHED_MIN_AXES }),
      action: toggle(
        'enriched',
        t('stats.enrichedPercent'),
        query.completeness === 'enriched',
        { completeness: 'enriched' },
        { completeness: undefined },
      ),
    },
    // #4349 V.1 — décision Louis 19/10 : « % profils enrichis » et « Mis à jour » ont quitté le
    // Vivier pour Réglages › Mes données (`TalentQualityBlock`) — un indicateur, un seul endroit (GA-26).
    {
      id: 'incomplete',
      icon: <FileWarning className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />,
      label: t('stats.incomplete'),
      value: String(stats.incompleteCount),
      action: toggle(
        'incomplete',
        t('stats.incomplete'),
        query.completeness === 'incomplete',
        { completeness: 'incomplete' },
        { completeness: undefined },
      ),
    },
    {
      id: 'favorites',
      icon: <Star className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />,
      label: t('stats.favorites'),
      value: favoriteCount === undefined ? notMeasured : String(favoriteCount),
      action: toggle(
        'favorites',
        t('stats.favorites'),
        query.favorite === 'mine',
        { favorite: 'mine' },
        { favorite: undefined },
      ),
    },
  ]

  return <KeyFigureRow testId="talent-key-figures" figures={figures} />
}
