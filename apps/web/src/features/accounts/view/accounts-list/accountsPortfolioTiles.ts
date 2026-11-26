import { metricDelta, type MetricDelta, type MetricPoint, type MetricSeriesResponse } from '@bellum/contracts'

/**
 * LES SIX TUILES DU BANDEAU DU PORTEFEUILLE (maquette 11, 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER DÉRIVE, IL N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute la décision — quelle tuile a une valeur, laquelle a une variation,
 * laquelle doit se taire et pourquoi — vit ICI, pure et testée. Le composant
 * ne fait que rendre ce qu'on lui donne. Un `??` glissé dans du JSX est la
 * façon exacte dont « non mesuré » redevient « 0 » : c'est arrivé sur d'autres
 * écrans, et la seule parade est de retirer au JSX le droit de décider.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX COMPTEURS QUI ÉTAIENT EN DOUBLE, ET CE QU'ILS SONT DEVENUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 30/08 avait ÉCARTÉ « missions en cours » et « freelances en
 * mission », avec une bonne raison : `GET /delivery/expansion` calculait
 * `expertsOnSite` comme `accountMissions.length`, donc le MÊME nombre
 * qu'`activeMissions`. Les afficher côte à côte aurait montré deux fois le même
 * chiffre sous deux noms.
 *
 * La source est réparée (`mission_assignments` est jointe, avec un
 * `COUNT(DISTINCT consultant_id)` sur la fenêtre couvrante). Les deux tuiles
 * sont donc deux MESURES, et elles reviennent — mais la seconde porte une
 * condition que la première n'a pas : voir {@link STAFFING_NOT_RECORDED}.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VARIATION MENSUELLE — CE QUI EST PHOTOGRAPHIÉ, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux des six populations SONT photographiées chaque mois, et pas sous une clé
 * à elles : elles sont les DÉNOMINATEURS de deux métriques d'hygiène. Le
 * registre `METRIC_SNAPSHOT_DENOMINATOR` le dit en toutes lettres — « comptes
 * suivis » est le total d'`accounts_without_next_action`, « missions actives »
 * celui de `missions_without_end_date` — et `METRICS_NOT_PHOTOGRAPHED` explique
 * pourquoi leur donner une clé propre serait un doublon (GA-26).
 *
 * Les quatre autres n'ont AUCUNE photo. Elles n'affichent donc aucune ligne de
 * variation — pas « non mesuré » non plus : quatre « non mesuré » alignés sous
 * six tuiles ne se lisent plus, et feraient conclure qu'on ne sait rien mesurer.
 * L'absence se dit UNE fois, sur la tuile, au survol.
 */

/** Les six tuiles, dans l'ordre de la maquette. */
export const PORTFOLIO_TILE_KEYS = [
  'total',
  'withBillingEntity',
  'activeMissions',
  'consultantsOnMission',
  'ready',
  'alerts',
] as const
export type PortfolioTileKey = (typeof PORTFOLIO_TILE_KEYS)[number]

/**
 * Sur QUOI chaque tuile compte — et c'est écrit à l'écran, pas seulement ici.
 *
 * `workspace` = tout l'espace, tel que le serveur l'a compté ;
 * `page` = les comptes AFFICHÉS. La liste est paginée avec un défilement
 * infini : un total dérivé des lignes chargées GRANDIT en faisant défiler.
 * C'est le défaut déjà payé sur les pastilles de `/contacts`, et la seule façon
 * honnête de le rendre est de dire de quoi on parle.
 */
const PORTFOLIO_TILE_SCOPE: Readonly<Record<PortfolioTileKey, 'workspace' | 'page'>> = {
  total: 'workspace',
  withBillingEntity: 'page',
  activeMissions: 'workspace',
  consultantsOnMission: 'workspace',
  ready: 'page',
  alerts: 'page',
}

/**
 * La métrique dont la POPULATION est ce que la tuile compte, ou `null`.
 *
 * ⚠️ On lit le DÉNOMINATEUR de ces photos, pas leur valeur : la valeur
 * d'`accounts_without_next_action` est « combien de comptes suivis n'ont pas de
 * prochaine action », son dénominateur est « combien de comptes sont suivis » —
 * et c'est le second que cette tuile affiche. Le registre des contrats a
 * délibérément refusé de leur donner une clé propre, pour ne pas recopier le
 * prédicat partagé qui définit « suivi » (GA-53).
 */
const TILE_POPULATION_METRIC: Readonly<Record<PortfolioTileKey, string | null>> = {
  total: 'accounts_without_next_action',
  withBillingEntity: null,
  activeMissions: 'missions_without_end_date',
  consultantsOnMission: null,
  ready: null,
  alerts: null,
}

/**
 * Pourquoi une tuile ne montre AUCUNE valeur. Toujours nommé — « non mesuré »
 * et « en panne » ne se ressemblent que pour qui ne les distingue pas.
 */
const PORTFOLIO_TILE_GAPS = ['loading', 'failed', 'staffing_not_recorded'] as const
/** NON exporté : personne ne le NOMME hors de ce fichier — le composant reçoit
 *  le type par inférence sur `PortfolioTile`. L'exporter ferait échouer
 *  `pnpm lint:exports:types` (knip refuse un type sans consommateur externe). */
type PortfolioTileGap = (typeof PORTFOLIO_TILE_GAPS)[number]

/**
 * Le cas qui fait taire « freelances en mission ».
 *
 * « 0 personne en poste » a deux lectures opposées : personne n'est chez un
 * client, ou personne n'a saisi qui y est. Elles ne se distinguent que par la
 * population — `missionsWithoutAssignment`. Quand TOUTES les missions actives
 * sont sans affectation enregistrée, le zéro ne mesure rien : il compte des
 * lignes que personne n'a écrites. L'annoncer ferait croire à un bench complet
 * à une agence qui tourne à plein.
 *
 * Sans mission active du tout, en revanche, `0` est VRAI et s'affiche : c'est
 * un stock à zéro, neutre, pas une alerte.
 */
function STAFFING_NOT_RECORDED(headline: StaffingHeadline): boolean {
  return headline.activeMissions > 0 && headline.missionsWithoutAssignment >= headline.activeMissions
}

/** Ce que `GET /delivery/staffing-headline` rend. */
export type StaffingHeadline = {
  activeMissions: number
  consultantsOnMission: number
  missionsWithoutAssignment: number
}

/** Une tuile prête à rendre. `value: null` ⇒ `gap` dit pourquoi. */
export type PortfolioTile = {
  key: PortfolioTileKey
  value: number | null
  gap: PortfolioTileGap | null
  /**
   * La variation depuis la photo du mois dernier.
   *
   * `null` = cette population n'est PAS photographiée — il n'y a rien à
   * attendre, et l'écran n'écrit aucune ligne. `{ measured: false }` = elle
   * l'est, mais la comparaison n'a pas abouti, et LÀ il faut le dire : c'est la
   * différence entre « on ne mesure pas ça » et « on n'a pas encore pu ».
   */
  delta: MetricDelta | null
  scope: 'workspace' | 'page'
  /** La population sur laquelle porte la valeur, quand elle en a une à
   *  annoncer — « sur 9 missions actives ». `null` = rien à préciser. */
  denominator: number | null
}

/** Le mois d'une date, `YYYY-MM`. Local et non UTC : « ce mois-ci » est celui
 *  du calendrier de qui regarde, pas celui de Greenwich. */
function monthKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Les photos de la POPULATION d'une métrique, du plus ancien au plus récent.
 *
 * ⚠️ Un mois dont le dénominateur n'a pas été lu est ÉCARTÉ, pas ramené à zéro.
 * `denominator: null` veut dire « population non lue » — la traiter comme une
 * population vide ferait une chute de 42 à 0, c'est-à-dire une catastrophe
 * inventée.
 */
function populationPoints(series: MetricSeriesResponse | null | undefined, metricKey: string): MetricPoint[] {
  const found = series?.series.find(entry => entry.metricKey === metricKey)
  if (!found) return []
  return found.points
    .filter(point => typeof point.denominator === 'number' && Number.isFinite(point.denominator))
    .map(point => ({ month: point.month, value: point.denominator as number }))
}

/**
 * La variation d'une tuile : la valeur d'AUJOURD'HUI comparée à la dernière
 * photo.
 *
 * C'est la même lecture que les deux écrans de pilotage font déjà : la photo
 * dit ce qui ÉTAIT vrai, la valeur courante vient de la liste. Comparer deux
 * photos entre elles répondrait à une autre question — « comment ça allait le
 * mois dernier » — et pas à celle que la tuile pose.
 *
 * ⚠️ Le calcul lui-même n'est PAS refait ici : `metricDelta` est la seule porte
 * du produit, et elle tient les cas de bord (base à zéro, base négative,
 * périodes mal ordonnées) que deux soustractions écrites à la main
 * divergeraient à traiter.
 */
function deltaFor(
  key: PortfolioTileKey,
  value: number | null,
  series: MetricSeriesResponse | null | undefined,
  now: Date,
): MetricDelta | null {
  const metricKey = TILE_POPULATION_METRIC[key]
  // Pas de photo pour cette population : aucune ligne, et surtout pas un « non
  // mesuré » qu'aucun balayage ne lèvera jamais.
  if (!metricKey) return null
  // Une valeur courante absente n'est pas une comparaison ratée : sans elle, il
  // n'y a rien à comparer, et `metricDelta` le dirait `no_current_snapshot`.
  // On le lui laisse dire — c'est SA taxonomie, pas la nôtre.
  const points = populationPoints(series, metricKey)
  const previous = points.length > 0 ? points[points.length - 1] : null
  return metricDelta({
    unit: 'count',
    previous,
    current: value === null ? null : { month: monthKey(now), value },
  })
}

/**
 * Ce que chaque tuile affiche, à partir des trois lectures de l'écran.
 *
 * Les trois arrivent séparément et échouent séparément : une panne du service
 * de delivery ne doit pas éteindre « comptes prêts à facturer », qui n'en
 * dépend pas. C'est pourquoi le `gap` est PAR TUILE et non global.
 */
export function buildPortfolioTiles(input: {
  /** Le compteur serveur des comptes suivis. `undefined` = pas encore lu. */
  followed: number | undefined
  /** Ce que la lentille facturation sait des comptes AFFICHÉS. `null` = elle
   *  n'a pas conclu (chargement ou échec) — jamais « 0 prêt ». */
  billing: { ready: number; blocked: number; withProfile: number } | null
  billingFailed: boolean
  /** Le bandeau de staffing. `null` = pas encore lu ; `'failed'` = en échec. */
  staffing: StaffingHeadline | null
  staffingFailed: boolean
  series: MetricSeriesResponse | null | undefined
  now: Date
}): PortfolioTile[] {
  const { followed, billing, billingFailed, staffing, staffingFailed, series, now } = input

  const billingGap: PortfolioTileGap | null = billingFailed ? 'failed' : billing ? null : 'loading'
  const staffingGap: PortfolioTileGap | null = staffingFailed ? 'failed' : staffing ? null : 'loading'

  const raw: Record<PortfolioTileKey, { value: number | null; gap: PortfolioTileGap | null; denominator?: number }> = {
    // ⚠️ `followed` absent est un CHARGEMENT, pas un zéro. Le serveur ne rend
    // les compteurs que sur la première page ; les lire comme « 0 compte » ferait
    // clignoter un portefeuille vide à chaque changement de filtre.
    total: { value: followed ?? null, gap: followed === undefined ? 'loading' : null },
    withBillingEntity: { value: billing?.withProfile ?? null, gap: billingGap },
    activeMissions: { value: staffing?.activeMissions ?? null, gap: staffingGap },
    consultantsOnMission:
      staffing && STAFFING_NOT_RECORDED(staffing)
        ? { value: null, gap: 'staffing_not_recorded' }
        : {
            value: staffing?.consultantsOnMission ?? null,
            gap: staffingGap,
            // La population qui rend le chiffre lisible : « sur 9 missions
            // actives ». Un dénombrement sans sa population n'est pas une mesure.
            ...(staffing ? { denominator: staffing.activeMissions } : {}),
          },
    ready: { value: billing?.ready ?? null, gap: billingGap },
    alerts: { value: billing?.blocked ?? null, gap: billingGap },
  }

  return PORTFOLIO_TILE_KEYS.map(key => ({
    key,
    value: raw[key].value,
    gap: raw[key].gap,
    delta: deltaFor(key, raw[key].value, series, now),
    scope: PORTFOLIO_TILE_SCOPE[key],
    denominator: raw[key].denominator ?? null,
  }))
}
