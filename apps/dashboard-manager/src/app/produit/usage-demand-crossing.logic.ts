import { hasEnoughSessionsToPublish } from '@bellum/contracts'
import type { RapportDemande } from '@/lib/product-analytics'
import type { VerdictEcran } from './screen-verdict.logic'

/**
 * #1688.4 — LE CROISEMENT USAGE × DEMANDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER AJOUTE, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `/produit` liste déjà l'usage (#1683, section « Utilisation par écran ») et
 * la demande non couverte (#1688, section « Demande non couverte » —
 * `RapportDemande.emptySearches`) comme deux sources SÉPARÉES. Ni l'une ni
 * l'autre n'est recalculée ici : ce fichier prend le verdict déjà dérivé par
 * `screen-verdict.logic.ts` (#1683.1) et le rapport de demande déjà chargé, et
 * les croise — la seule chose qui manquait, comme le dit l'issue.
 *
 * Les retours bêta (troisième source de la page) restent HORS de ce
 * croisement : la section qui les lit le dit déjà elle-même, « corrélation,
 * jamais une seconde dérivation » (`page.tsx`, `SectionRetoursParEcran`), et
 * le titre de la section demande de `/produit` porte déjà le mot « demande »
 * — c'est cette source-là que l'issue vise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CASES, ET LA CINQUIÈME QUI N'EN EST PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 *                          demande ÉLEVÉE         demande FAIBLE
 *   usage ÉLEVÉ         adopté, sous tension     adopté, sans tension
 *   usage FAIBLE         attendu mais absent       sous-utilisé
 *
 * « attendu mais absent » est la phrase de l'issue « ce qu'on n'a pas et que
 * tout le monde cherche » ; « sous-utilisé » est « ce qu'on a et que personne
 * n'utilise ». `non_mesure` n'est PAS une cinquième case du même rang que les
 * quatre : c'est ce qui arrive quand l'UNE des deux sources ne permet pas de
 * trancher pour cet écran — jamais un zéro, jamais une case vide muette
 * (doctrine : « une case du croisement dont une des deux sources manque est
 * non mesuré »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'AXE DEMANDE APPLIQUE SON PROPRE SEUIL DE SESSIONS, EN PLUS DE CELUI DE L'API
 * ─────────────────────────────────────────────────────────────────────────────
 * L'API ne publie `emptySearches` QUE si le total de sessions ayant cherché,
 * TOUS ÉCRANS CONFONDUS, franchit `MIN_DISTINCT_SESSIONS_FOR_A_METRIC`
 * (`publish(searchSessions.size, …)`, `product-analytics-read.service.ts`) —
 * mais une LIGNE individuelle de ce tableau peut porter beaucoup moins de
 * sessions que ce total (le seuil global peut être franchi par d'autres
 * écrans). Ce croisement lit une granularité plus fine (par écran) que le
 * total qui a validé la publication : il réapplique donc le même seuil, par
 * ligne, avant de qualifier une case « élevée » ou « faible » — jamais après
 * coup, jamais en supposant que la garde globale suffit à une lecture plus
 * précise qu'elle.
 */

// Les trois types ci-dessous ne sont PAS exportés séparément : `LigneCroisement`
// (exporté plus bas, consommé par `_components/produit-tables.tsx`) les porte
// déjà comme champs, et aucun appelant n'a besoin de les nommer un par un —
// un type exporté sans second lecteur nommé est le bruit que
// `pnpm lint:exports:types` (knip) refuse.

/** L'axe usage, réduit à trois états — jamais recalculé : dérivé du verdict
 *  de {@link import('./screen-verdict.logic').verdictsDesEcrans}. */
type AxeUsage = 'eleve' | 'faible' | 'non_mesure'

/** L'axe demande — élevée quand des recherches sur cet écran ne trouvent
 *  rien, dans une proportion mesurable et publiable. */
type AxeDemande = 'eleve' | 'faible' | 'non_mesure'

type QuadrantUsageDemande =
  | 'adopte_sous_tension'
  | 'adopte_sans_tension'
  | 'sous_utilise'
  | 'attendu_mais_absent'
  | 'non_mesure'

/** Au-dessus de ce taux d'échec de recherche (sur un écran, à sessions
 *  suffisantes), la demande est dite « élevée ». Trois recherches sur dix qui
 *  ne trouvent rien : un signal qu'on ne peut pas attribuer au hasard. */
export const TAUX_ECHEC_RECHERCHE_MIN_DEMANDE_ELEVEE = 0.3

/** `travaillé`/`consulté` disent un usage réel ; `survolé`/`jamais
 *  ouvert`/`trop récent` disent le contraire ; les deux états honnêtes
 *  (observations insuffisantes, non mesuré) ne permettent pas de trancher. */
export function axeUsageDeVerdict(verdict: VerdictEcran): AxeUsage {
  switch (verdict.kind) {
    case 'travaille':
    case 'consulte':
      return 'eleve'
    case 'survole':
    case 'jamais_ouvert':
    case 'trop_recent':
      return 'faible'
    case 'observations_insuffisantes':
    case 'non_mesure':
      return 'non_mesure'
  }
}

type EmptySearches = RapportDemande['emptySearches']
type EmptySearchesMesurees = Extract<EmptySearches, { kind: 'measured' }>
type EmptySearchLigne = EmptySearchesMesurees['value'][number]

/**
 * L'axe demande d'UN écran, à partir du rapport #1688 déjà chargé.
 *
 * Un écran absent du tableau, quand le canal est mesuré, est un ZÉRO VRAI :
 * l'API ne liste que les écrans où `emptySearches > 0`
 * (`product-analytics-read.service.ts`, `.filter(row => row.emptySearches > 0)`)
 * — son absence dit « zéro recherche sans résultat mesurée ici », pas
 * « personne n'a cherché ». C'est la même distinction qu'un écran « jamais
 * ouvert » (#1683.1) : un vrai zéro ne désigne personne, il ne franchit donc
 * aucun seuil.
 */
export function axeDemandePourEcran(route: string, demande: Pick<RapportDemande, 'emptySearches'>): AxeDemande {
  if (demande.emptySearches.kind !== 'measured') return 'non_mesure'
  const ligne: EmptySearchLigne | undefined = demande.emptySearches.value.find(l => l.route === route)
  if (!ligne) return 'faible'
  if (!hasEnoughSessionsToPublish(ligne.sessions)) return 'non_mesure'
  return ligne.emptyRate.kind === 'measured' && ligne.emptyRate.ratio >= TAUX_ECHEC_RECHERCHE_MIN_DEMANDE_ELEVEE
    ? 'eleve'
    : 'faible'
}

/** Le croisement pur, sans lecture d'aucune donnée — la table du docblock de
 *  tête, en code. `non_mesure` gagne dès qu'UN SEUL des deux axes l'est. */
export function croiserUsageEtDemande(usage: AxeUsage, demande: AxeDemande): QuadrantUsageDemande {
  if (usage === 'non_mesure' || demande === 'non_mesure') return 'non_mesure'
  if (usage === 'eleve') return demande === 'eleve' ? 'adopte_sous_tension' : 'adopte_sans_tension'
  return demande === 'eleve' ? 'attendu_mais_absent' : 'sous_utilise'
}

export type LigneCroisement = {
  route: string
  label: { fr: string; en: string }
  usage: AxeUsage
  demande: AxeDemande
  quadrant: QuadrantUsageDemande
}

/**
 * Une ligne par écran du catalogue — jamais par écran d'une des deux sources :
 * un écran dont le verdict usage est inconnu (absent de `verdictParRoute`)
 * apparaît quand même, avec `usage: 'non_mesure'`, jamais silencieusement omis.
 */
export function croisementParEcran(
  ecransProduit: readonly { route: string; label: { fr: string; en: string } }[],
  verdictParRoute: ReadonlyMap<string, VerdictEcran>,
  demande: Pick<RapportDemande, 'emptySearches'>,
): LigneCroisement[] {
  return ecransProduit.map(ecran => {
    const verdict = verdictParRoute.get(ecran.route)
    const usage = verdict ? axeUsageDeVerdict(verdict) : 'non_mesure'
    const axeDemande = axeDemandePourEcran(ecran.route, demande)
    return {
      route: ecran.route,
      label: ecran.label,
      usage,
      demande: axeDemande,
      quadrant: croiserUsageEtDemande(usage, axeDemande),
    }
  })
}

export function libelleQuadrant(quadrant: QuadrantUsageDemande): string {
  switch (quadrant) {
    case 'adopte_sous_tension':
      return 'adopté, sous tension'
    case 'adopte_sans_tension':
      return 'adopté, sans tension'
    case 'sous_utilise':
      return 'sous-utilisé'
    case 'attendu_mais_absent':
      return 'attendu mais absent'
    case 'non_mesure':
      return 'non mesuré'
  }
}
