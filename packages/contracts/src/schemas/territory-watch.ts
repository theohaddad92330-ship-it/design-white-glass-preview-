/**
 * La veille territoriale — ce qui a CHANGÉ sur un département (tome 4 §21.3).
 *
 * L'écran Territoire répond à « qu'est-ce qu'il y a là-bas ? ». Il ne répond
 * pas à « qu'est-ce qui a bougé depuis la semaine dernière ? », qui est la
 * question d'un commercial qui suit un territoire — et la seule des deux qui
 * mérite une notification.
 *
 * Trois règles d'honnêteté portent ce module, chacune contre une erreur qu'on a
 * déjà faite ailleurs dans le dépôt :
 *
 * 1. **Une mesure absente n'est pas une chute.** Une semaine où la source
 *    d'offres n'a pas répondu écrit `null`, pas `0`. La comparer produirait
 *    « −100 % d'offres » et une notification affolante sur un marché qui n'a
 *    pas bougé d'un pouce.
 * 2. **Une variation relative sur une petite base est du bruit.** Passer de 4 à
 *    7 offres, c'est « +75 % » et ça ne veut rien dire. En dessous du plancher,
 *    on regarde l'écart ABSOLU.
 * 3. **La moyenne de recrutement d'une ESN est une MÉDIANE.** Une semaine de
 *    campagne massive déplacerait une moyenne et ferait passer l'ESN pour une
 *    entreprise qui déborde en permanence.
 */

import { type MetricDelta, type MetricDeltaGap, metricDelta } from './metric-snapshot.js'

/**
 * Les quatre mesures qu'une photo de territoire porte, et qui s'AFFICHENT.
 *
 * `esnHiring` n'en fait pas partie : c'est une LISTE, pas un dénombrement, et
 * elle ne se lit pas avec les mêmes règles.
 */
export const TERRITORY_MEASURE_KEYS = ['offers', 'esnPresent', 'openTenders', 'awardedContracts'] as const
export type TerritoryMeasureKey = (typeof TERRITORY_MEASURE_KEYS)[number]

/**
 * Le REGISTRE PUBLIC derrière chaque mesure.
 *
 * On les NOMME, et c'est la règle et non son exception : un registre public se
 * nomme parce que son nom EST la garantie (D354). L'interdit porte sur le nom
 * d'un ÉDITEUR — notre fournisseur, l'outil du client —, jamais sur celui d'un
 * registre que n'importe qui peut aller consulter pour vérifier le chiffre.
 */
export const TERRITORY_MEASURE_REGISTRIES: Record<TerritoryMeasureKey, string> = {
  offers: 'France Travail',
  esnPresent: 'Annuaire des Entreprises',
  openTenders: 'BOAMP',
  awardedContracts: 'DECP',
}

/**
 * LA BORNE DE COLLECTE DE CHAQUE MESURE — le cœur de ce module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « 100 » VOULAIT DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran Marché affichait « Offres IT : 100 » sur DEUX départements. Cent tout
 * rond, deux fois, ce n'est pas une mesure — c'est un plafond :
 *
 *     apps/ia/app/services/territory_overview.py
 *       hiring_task = list_hiring_companies(department, None, since_days, 100)
 *     apps/ia/app/services/data_sources/france_travail.py:608
 *       return [row for _dt, row in rows[:limit]]
 *
 * `market.offers` vaut `len(rows)`, donc **au plus 100**. Un département qui
 * publie trois cents offres IT rend « 100 », exactement comme celui qui en
 * publie cent une. Les afficher tels quels fait de deux territoires
 * incomparables deux territoires identiques.
 *
 * Les trois autres ont la même forme : `openTenders` (BOAMP) et
 * `awardedContracts` (DECP) sont appelés à 50, et le registre d'entreprises
 * plafonne LUI-MÊME son `total_results` à 10 000 — le service IA le dit dans sa
 * raison (`REGISTRY_COUNT_CEILING`), et l'écran ne la lisait pas.
 *
 * ⚠️ Ces valeurs sont un MIROIR d'un appel qui vit dans le service Python. La
 * garde `territory-collection-bounds.spec.ts` relit ce fichier-là et tombe si
 * l'une des deux bouge sans l'autre : un miroir que rien ne confronte à son
 * original devient faux sans prévenir, et c'est précisément ce défaut-ci.
 */
export const TERRITORY_COLLECTION_LIMITS: Record<TerritoryMeasureKey, number> = {
  offers: 100,
  esnPresent: 10_000,
  openTenders: 50,
  awardedContracts: 50,
}

/**
 * QUI a pris la photo.
 *
 * `territory_snapshots` est PARTAGÉE entre tous les espaces — c'est pour cette
 * raison que la salle de démonstration n'y semait rien : « en fabriquer de
 * fausses ferait mentir la moyenne de tout le monde ». Résultat, l'écran Marché
 * s'ouvrait sans une seule tendance devant un prospect.
 *
 * L'étiquette tranche les deux : une photo `demo` existe pour la salle et
 * n'est lue par RIEN d'autre — ni la médiane de recrutement du référentiel, ni
 * le tableau d'un espace client. Contrainte `territory_snapshots_source_check`.
 */
export const TERRITORY_SNAPSHOT_SOURCES = ['sweep', 'demo'] as const
export type TerritorySnapshotSource = (typeof TERRITORY_SNAPSHOT_SOURCES)[number]

/** Une photo d'un département à une date. `null` = « pas mesuré cette
 *  semaine-là », jamais « zéro ». */
export type TerritorySnapshot = {
  takenOn: string
  offers: number | null
  esnPresent: number | null
  openTenders: number | null
  awardedContracts: number | null
  esnHiring: { name: string; offers: number }[]
  /**
   * Les bornes EN VIGUEUR au moment de la prise. Vide sur les photos d'avant le
   * 31/08/2026 : on ne réécrit pas rétroactivement ce qu'on ne sait pas. La
   * lecture retombe alors sur {@link TERRITORY_COLLECTION_LIMITS}, et le dit.
   */
  collectionLimits?: Partial<Record<TerritoryMeasureKey, number>>
}

/**
 * COMMENT SE LIT UN DÉNOMBREMENT DE TERRITOIRE.
 *
 * Trois états, et le second est celui qui manquait :
 *  · `counted` — un vrai dénombrement, y compris zéro (zéro appel d'offres
 *    ouvert est une information, la refuser serait la faute symétrique) ;
 *  · `at_least` — la collecte a atteint sa borne. Le chiffre est un PLANCHER.
 *    « Au moins 100 », jamais « 100 » ;
 *  · `unmeasured` — la source n'a pas répondu. Jamais « 0 ».
 */
export type TerritoryCountReading =
  | { state: 'counted'; value: number }
  | { state: 'at_least'; value: number; ceiling: number }
  | { state: 'unmeasured' }

/**
 * Lit une mesure de territoire pour ce qu'elle est.
 *
 * @param value    Ce que la photo porte. `null` = non mesuré.
 * @param ceiling  La borne ENREGISTRÉE avec la photo, si elle en a une.
 * @param key      La mesure, pour retomber sur la borne en vigueur quand la
 *                 photo est antérieure à l'enregistrement des bornes.
 */
export function readTerritoryCount(
  value: number | null | undefined,
  ceiling: number | null | undefined,
  key?: TerritoryMeasureKey,
): TerritoryCountReading {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { state: 'unmeasured' }
  const bound =
    typeof ceiling === 'number' && Number.isFinite(ceiling) && ceiling > 0
      ? ceiling
      : key
        ? TERRITORY_COLLECTION_LIMITS[key]
        : null
  // `>=` et non `===` : une photo prise sous une borne plus large porte parfois
  // une valeur au-dessus de celle qu'on lui attribue aujourd'hui. Elle reste un
  // plancher — la lire comme un compte exact serait le même mensonge en plus
  // discret.
  if (bound !== null && value >= bound) return { state: 'at_least', value, ceiling: bound }
  return { state: 'counted', value }
}

/** La borne réellement en vigueur pour une photo donnée. */
function ceilingFor(snapshot: TerritorySnapshot, key: TerritoryMeasureKey): number {
  const recorded = snapshot.collectionLimits?.[key]
  return typeof recorded === 'number' && Number.isFinite(recorded) && recorded > 0
    ? recorded
    : TERRITORY_COLLECTION_LIMITS[key]
}

/**
 * Pourquoi une tendance territoriale n'a pas pu être lue.
 *
 * Les quatre premières viennent de `metricDelta` — on ne les redéfinit pas. La
 * cinquième est propre à ce module : **au moins une des deux mesures était
 * BORNÉE**, donc leur différence ne mesure rien. « 100 → 100 » n'est pas
 * « stable » : ce sont deux plafonds.
 */
export type TerritoryTrendGap = MetricDeltaGap | 'bounded_reading'

export type TerritoryTrend =
  | { measured: false; gap: TerritoryTrendGap }
  | {
      measured: true
      change: number
      /** `null` sur une base à zéro — jamais « +∞ % », jamais « 0 % ». */
      percent: number | null
      from: number
      to: number
      fromDate: string
      toDate: string
    }

/**
 * L'arithmétique de variation, empruntée à `metricDelta` et jamais recopiée.
 *
 * ⚠️ POURQUOI UN ADAPTATEUR PLUTÔT QU'UN APPEL DIRECT. `metricDelta` indexe ses
 * points par MOIS (`YYYY-MM`) : les photos de territoire sont HEBDOMADAIRES, et
 * deux photos du même mois lui apparaîtraient « pas dans l'ordre ». Elle
 * rendrait « non mesuré » sur une variation parfaitement mesurable, trois
 * semaines sur quatre.
 *
 * On lui passe donc deux clés d'ORDRE construites ici — après avoir vérifié
 * l'ordre sur les VRAIES dates —, et les vraies dates ressortent à côté. Aucun
 * appelant ne voit jamais ces clés : elles ne quittent pas cette fonction.
 *
 * Ce qu'on ne fait PAS : réécrire la division. La base à zéro et la base
 * négative sont exactement les cas de bord où deux implémentations divergent, et
 * il n'y en a qu'une dans ce dépôt.
 */
const ORDER_KEY_PREVIOUS = '0001-01'
const ORDER_KEY_LATEST = '0001-02'

function countDelta(from: number, to: number): MetricDelta {
  return metricDelta({
    unit: 'count',
    previous: { month: ORDER_KEY_PREVIOUS, value: from },
    current: { month: ORDER_KEY_LATEST, value: to },
  })
}

/**
 * La tendance d'une mesure entre deux photos.
 *
 * DEUX photos suffisent, une seule ne suffit pas — et c'est dit, pas tu :
 * `no_previous_snapshot` est le cas normal de la première semaine, pas une
 * panne. Voir le §2 du docblock de `metric-snapshot.ts`, qui pose la même règle
 * pour les photos mensuelles.
 */
export function territoryTrend(input: {
  key: TerritoryMeasureKey
  previous: TerritorySnapshot | null | undefined
  latest: TerritorySnapshot | null | undefined
}): TerritoryTrend {
  const { key, previous, latest } = input
  if (!previous) return { measured: false, gap: 'no_previous_snapshot' }
  if (!latest) return { measured: false, gap: 'no_current_snapshot' }

  const from = previous[key]
  const to = latest[key]
  if (typeof from !== 'number' || !Number.isFinite(from)) return { measured: false, gap: 'no_previous_snapshot' }
  if (typeof to !== 'number' || !Number.isFinite(to)) return { measured: false, gap: 'no_current_snapshot' }
  if (previous.takenOn >= latest.takenOn) return { measured: false, gap: 'periods_not_ordered' }

  // La règle du lot : un chiffre BORNÉ n'est pas un dénombrement, donc sa
  // différence avec un autre n'est pas une variation. Un seul des deux côtés
  // suffit à l'invalider — « 60 → 100 » n'est pas « +40 » si 100 est le
  // plafond : le vrai chiffre est peut-être 340.
  const previousReading = readTerritoryCount(from, ceilingFor(previous, key), key)
  const latestReading = readTerritoryCount(to, ceilingFor(latest, key), key)
  if (previousReading.state === 'at_least' || latestReading.state === 'at_least') {
    return { measured: false, gap: 'bounded_reading' }
  }

  const delta = countDelta(from, to)
  if (!delta.measured) return { measured: false, gap: delta.gap }
  return {
    measured: true,
    change: delta.change,
    percent: delta.percent,
    from,
    to,
    fromDate: previous.takenOn,
    toDate: latest.takenOn,
  }
}

/**
 * #2206.42 — L'HORIZON STRUCTUREL, JAMAIS L'ACTUEL DÉGUISÉ.
 *
 * L'écran Marché ne portait qu'un horizon : `territoryTrend` entre les deux
 * DERNIÈRES photos — « ce qui bouge cette semaine ». Un commercial qui suit un
 * territoire depuis six mois se pose aussi l'autre question : « où va ce
 * département sur la durée ? ». Les deux sont deux mesures DIFFÉRENTES, jamais
 * le même calcul recopié : la même arithmétique (`territoryTrend`, empruntée et
 * non réécrite), appliquée à un COUPLE de photos différent — la plus ancienne
 * disponible et la plus récente, au lieu des deux dernières.
 *
 * ⚠️ Le gate n'est pas cosmétique. Avec deux photos ou moins, la structurelle
 * SERAIT l'actuelle — la même paire, sous un autre titre. Et avec un fond de
 * moins de 30 jours (trois photos serrées sur deux semaines, par exemple), la
 * phrase « tendance de fond » mentirait sur ce qu'elle mesure vraiment. Dans
 * les deux cas, `not_enough_history` — jamais un chiffre, jamais zéro.
 */
export const STRUCTURAL_TREND_MIN_SPAN_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS)
}

/** Pourquoi l'horizon structurel n'a pas pu être lu — `not_enough_history` en
 *  plus des raisons de `territoryTrend`, pour le cas propre à ce fond : pas
 *  assez de photos, ou une plus ancienne trop récente pour faire du recul. */
export type TerritoryStructuralTrendGap = TerritoryTrendGap | 'not_enough_history'

export type TerritoryStructuralTrend =
  | { measured: false; gap: TerritoryStructuralTrendGap }
  | {
      measured: true
      change: number
      percent: number | null
      from: number
      to: number
      fromDate: string
      toDate: string
    }

/**
 * L'horizon structurel d'une mesure — entre la plus ANCIENNE photo de
 * l'historique fourni et la plus récente, avec l'étendue réelle nommée
 * (`fromDate`, à afficher « depuis le JJ/MM »).
 *
 * @param history Du plus ANCIEN au plus RÉCENT (l'ordre que rend déjà
 *                `TerritoryWatchService.history`) — jamais l'inverse.
 */
export function territoryStructuralTrend(input: {
  key: TerritoryMeasureKey
  history: TerritorySnapshot[]
}): TerritoryStructuralTrend {
  const { key, history } = input
  // Deux photos ou moins : la structurelle serait l'actuelle sous un autre nom.
  if (history.length <= 2) return { measured: false, gap: 'not_enough_history' }
  const oldest = history[0] as TerritorySnapshot
  const latest = history[history.length - 1] as TerritorySnapshot
  if (daysBetween(oldest.takenOn, latest.takenOn) < STRUCTURAL_TREND_MIN_SPAN_DAYS) {
    return { measured: false, gap: 'not_enough_history' }
  }
  return territoryTrend({ key, previous: oldest, latest })
}

/**
 * En dessous de ce volume, la variation se lit en NOMBRE et non en pourcentage.
 * Le seuil vient de `MIN_OFFERS_FOR_TECH_RANKING` côté IA : c'est le même
 * raisonnement — sous une trentaine d'offres, un département ne porte pas de
 * tendance.
 */
export const NOISE_FLOOR_OFFERS = 30

/** Une variation relative en dessous de ce seuil ne vaut pas une interruption. */
export const MEANINGFUL_VARIATION = 0.2

/**
 * Sous ce nombre de photos, il n'y a pas de moyenne — il y a des points.
 *
 * Treize semaines, soit un trimestre : c'est la première fenêtre où « cette ESN
 * recrute plus que d'habitude » a un « d'habitude » derrière.
 */
export const MIN_SNAPSHOTS_FOR_BASELINE = 13

/**
 * Ce qui peut bouger sur un territoire.
 *
 * ⚠️ Additif, comme toute taxonomie du dépôt (GA-08) : `esn_left` est arrivé le
 * 31/08/2026 EN FIN de liste. Les entrées étaient vues, les SORTIES non — un
 * territoire qui se vide se lisait donc « rien de notable », ce qui est
 * exactement l'inverse de ce qui s'y passait.
 */
export const TERRITORY_CHANGE_KINDS = ['offers', 'tenders', 'awards', 'new_esn', 'esn_surge', 'esn_left'] as const
export type TerritoryChangeKind = (typeof TERRITORY_CHANGE_KINDS)[number]

export type TerritoryChange = {
  kind: TerritoryChangeKind
  label: string
  /** Ce qui a été mesuré, pour que l'écran n'ait pas à recalculer. */
  from: number | null
  to: number | null
  /** Le nom concerné, quand le changement porte sur une entreprise. */
  subject?: string
}

/**
 * CE QU'UN MOUVEMENT DIT, EN TOUTES LETTRES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran Marché écrivait littéralement :
 *
 *     SCC France — — → 1
 *
 * Deux tirets cadratins, parce que le JSX faisait `{change.from ?? '—'} →
 * {change.to ?? '—'}`. Une variation depuis une valeur INCONNUE n'est pas
 * « — → 1 » : c'est une ENTRÉE, et une entrée s'écrit en toutes lettres. La
 * forme du mouvement est une propriété du mouvement, pas une coquetterie
 * d'affichage — c'est pourquoi elle est calculée ici et pas dans le composant.
 *
 * `unreadable` existe pour le cas où les deux bornes manquent : il ne se produit
 * pas aujourd'hui (`territoryChanges` ne le fabrique jamais), et une fonction
 * qui rendrait `undefined` obligerait chaque appelant à inventer sa propre
 * réponse à une question qu'il ne se pose pas.
 */
export type TerritoryChangeReading =
  | { shape: 'entered'; to: number }
  | { shape: 'left'; from: number }
  | { shape: 'moved'; from: number; to: number; change: number; percent: number | null }
  | { shape: 'unreadable' }

export function territoryChangeReading(change: TerritoryChange): TerritoryChangeReading {
  const from = typeof change.from === 'number' && Number.isFinite(change.from) ? change.from : null
  const to = typeof change.to === 'number' && Number.isFinite(change.to) ? change.to : null
  if (from === null && to !== null) return { shape: 'entered', to }
  if (from !== null && to === null) return { shape: 'left', from }
  if (from === null || to === null) return { shape: 'unreadable' }
  const delta = countDelta(from, to)
  if (!delta.measured) return { shape: 'unreadable' }
  return { shape: 'moved', from, to, change: delta.change, percent: delta.percent }
}

/** Deux mesures comparables, ou rien. */
function comparable(a: number | null | undefined, b: number | null | undefined): boolean {
  return typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
}

/**
 * Un écart mérite-t-il d'être annoncé ?
 *
 * Au-dessus du plancher de bruit on raisonne en proportion ; en dessous, en
 * nombre — parce que « +75 % » sur quatre offres est vrai et inutile.
 */
export function isMeaningfulShift(from: number, to: number): boolean {
  if (from === to) return false
  const base = Math.max(from, to)
  if (base < NOISE_FLOOR_OFFERS) return Math.abs(to - from) >= NOISE_FLOOR_OFFERS / 2
  return Math.abs(to - from) / Math.max(from, 1) >= MEANINGFUL_VARIATION
}

/**
 * Ce qui a changé entre la photo précédente et la dernière.
 *
 * Rend une liste VIDE quand rien de notable n'a bougé — ce qui est le cas
 * normal, et ce silence est le prix à payer pour qu'une notification veuille
 * dire quelque chose le jour où elle arrive.
 */
export function territoryChanges(
  previous: TerritorySnapshot | null,
  latest: TerritorySnapshot | null,
): TerritoryChange[] {
  if (!latest || !previous) return []
  const changes: TerritoryChange[] = []

  const volumes: { kind: TerritoryChange['kind']; key: keyof TerritorySnapshot; label: string }[] = [
    { kind: 'offers', key: 'offers', label: 'offres IT publiées' },
    { kind: 'tenders', key: 'openTenders', label: 'appels d’offres ouverts' },
    { kind: 'awards', key: 'awardedContracts', label: 'marchés attribués' },
  ]
  for (const { kind, key, label } of volumes) {
    const from = previous[key] as number | null
    const to = latest[key] as number | null
    // Une semaine non mesurée ne produit AUCUNE variation. C'est la règle qui
    // évite « −100 % d'offres » un jour où la source était en maintenance.
    if (!comparable(from, to)) continue
    if (!isMeaningfulShift(from as number, to as number)) continue
    changes.push({ kind, label, from: from as number, to: to as number })
  }

  // Une ESN qui n'était pas là la semaine dernière et qui publie aujourd'hui :
  // c'est le signal de débordement le plus net qu'un territoire produise.
  const before = new Map(previous.esnHiring.map(e => [e.name, e.offers]))
  for (const entry of latest.esnHiring) {
    const was = before.get(entry.name)
    if (was === undefined) {
      changes.push({
        kind: 'new_esn',
        label: 'nouvelle ESN qui recrute sur le territoire',
        from: null,
        to: entry.offers,
        subject: entry.name,
      })
      continue
    }
    if (isMeaningfulShift(was, entry.offers) && entry.offers > was) {
      changes.push({
        kind: 'esn_surge',
        label: 'accélération de recrutement',
        from: was,
        to: entry.offers,
        subject: entry.name,
      })
    }
  }

  // Les SORTIES, symétriques des entrées. Une ESN qui recrutait la semaine
  // dernière et qui a disparu de la liste est un signal aussi net que son
  // arrivée — et sans lui, un territoire qui se vide s'affiche « rien de
  // notable », c'est-à-dire l'inverse de ce qui s'y passe.
  const after = new Set(latest.esnHiring.map(entry => entry.name))
  for (const entry of previous.esnHiring) {
    if (after.has(entry.name)) continue
    changes.push({
      kind: 'esn_left',
      label: 'ESN qui ne recrute plus sur le territoire',
      from: entry.offers,
      to: null,
      subject: entry.name,
    })
  }
  return changes
}

/**
 * La moyenne de recrutement d'une ESN, sur l'historique des photos.
 *
 * C'est la valeur qui MANQUE aujourd'hui pour que l'axe « Volume » du score de
 * débordement soit mesurable : il compare le recrutement courant à une moyenne
 * que rien n'écrivait. Sans un trimestre d'historique, on rend `null` — un
 * « d'habitude » construit sur trois semaines n'est pas un « d'habitude ».
 *
 * MÉDIANE et non moyenne : une campagne de recrutement d'une semaine déplace
 * une moyenne et ferait passer une ESN pour un débordeur permanent.
 */
export function hiringBaseline(snapshots: TerritorySnapshot[], esnName: string): number | null {
  const series = snapshots
    .map(s => s.esnHiring.find(e => e.name === esnName)?.offers)
    .filter((n): n is number => typeof n === 'number')
  if (series.length < MIN_SNAPSHOTS_FOR_BASELINE) return null
  const sorted = [...series].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2)
    : (sorted[mid] as number)
}
