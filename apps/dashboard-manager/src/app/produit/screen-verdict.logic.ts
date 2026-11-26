import type { RapportEcrans } from '@/lib/product-analytics'

/**
 * #1683.1 — LE VERDICT PAR ÉCRAN, à un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `/produit` rendait vues / sessions / durée / rebond / action, BRUTS — un
 * opérateur devait recomposer lui-même « est-ce que cet écran vit ? » à partir
 * de cinq nombres, section après section. L'issue demande un verdict à CINQ
 * valeurs : travaillé · consulté · survolé · jamais ouvert · trop récent. Ce
 * fichier les dérive, et rien ne les recalcule ailleurs (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SEPT ÉTATS DE SORTIE, PAS CINQ
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq verdicts demandés s'appliquent à un écran dont on a assez mesuré
 * pour trancher. Deux cas ne le sont pas, et les nommer EST la doctrine
 * (« non mesuré n'est jamais 0 ») :
 *
 *  · **`observations_insuffisantes`** — l'écran a des vues dans la fenêtre,
 *    mais moins que le seuil de sessions distinctes que l'API applique déjà
 *    (`hasEnoughSessionsToPublish`, `@bellum/contracts`). Ce n'est pas
 *    « survolé » : un écran survolé, on l'a VU se survoler ; ici on n'a pas
 *    assez regardé pour le dire.
 *  · **`non_mesure`** — l'écran n'a AUCUNE vue mesurée sur la fenêtre, et on ne
 *    sait pas depuis quand il existe. « Trop récent » et « jamais ouvert » ne
 *    disent PAS la même chose (un écran livré hier sans vue n'est pas un écran
 *    mort), et les distinguer suppose une date de mise en service. Elle
 *    N'EXISTE dans aucune donnée que ce back-office peut lire aujourd'hui —
 *    ni le catalogue d'écrans (`@bellum/contracts/product-screens-catalog`,
 *    qui ne porte qu'une route et un libellé), ni le rapport d'usage (qui ne
 *    porte que la fenêtre balayée). Deviner serait fabriquer un verdict ; ce
 *    fichier dit « non mesuré » à la place, et le jour où une date de mise en
 *    service devient lisible quelque part, elle se branche par
 *    `shippedAtParRoute` sans toucher au reste de ce fichier.
 *
 * Les sept comptent ENSEMBLE : `verdictsDesEcrans` produit un verdict par
 * écran d'entrée, par un simple `.map` — la preuve que les sept s'additionnent
 * au total d'écrans est donc structurelle, pas une coïncidence à re-vérifier
 * à chaque ajout (testée quand même, en cas de refactor qui casserait cette
 * propriété).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ZÉRO VUE N'A PAS BESOIN DU SEUIL DE SESSIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seuil (`MIN_DISTINCT_SESSIONS_FOR_A_METRIC`, 5) protège une MOYENNE :
 * sous 5 sessions, un taux ou une durée médiane désigne quelqu'un. Un compte à
 * ZÉRO ne moyenne rien — c'est l'énoncé le plus sûr qui existe (« personne »,
 * pas « untel »). C'est la même raison qui fait qu'un agrégat MESURÉ ET VIDE
 * (`rapport.exits`/`rapport.repetitions` à zéro cas) s'affiche déjà sans ce
 * seuil ailleurs sur cette page (`BlocMesure`, « un ZÉRO VRAI »). `jamais_ouvert`
 * en est le pendant pour un écran entier.
 */

export type EcranMesureLigne = RapportEcrans['screens'][number]

/** #1683.1 — les cinq verdicts demandés, plus les deux états honnêtes qui les
 *  complètent (« observations insuffisantes », « non mesuré »). Sept, jamais
 *  deux confondus. */
export type VerdictEcran =
  | { kind: 'travaille' }
  | { kind: 'consulte' }
  | { kind: 'survole' }
  | { kind: 'jamais_ouvert' }
  | { kind: 'trop_recent'; depuisJours: number }
  | { kind: 'observations_insuffisantes'; sessions: number; seuil: number }
  | { kind: 'non_mesure'; raison: string }

/** Sous ce taux d'action (part des vues suivies d'au moins une action), un
 *  écran mesuré n'est pas « travaillé ». Une action sur trois : un usage qui
 *  produit quelque chose, pas une simple consultation. */
export const TAUX_ACTION_MIN_TRAVAILLE = 0.3

/** Au-dessus de ce taux de rebond (vue fermée en moins de 10 s sans action —
 *  seuil déjà posé côté API, `BOUNCE_MAX_DURATION_MS`), et SOUS le taux
 *  d'action ci-dessus, un écran mesuré est « survolé ». */
export const TAUX_REBOND_MIN_SURVOLE = 0.6

/** Sous ce nombre de jours depuis la mise en service, un écran sans aucune vue
 *  mesurée est « trop récent », pas « jamais ouvert ». Deux semaines : assez
 *  pour qu'un usage régulier ait eu l'occasion de se manifester au moins une
 *  fois, assez court pour rester une vraie grâce. */
export const GRACE_MISE_EN_SERVICE_JOURS = 14

const MS_PAR_JOUR = 24 * 60 * 60 * 1000

type MesuresMesurees = Extract<EcranMesureLigne['measures'], { kind: 'measured' }>

/** La priorité qui tranche entre travaillé / survolé / consulté. L'action
 *  l'emporte sur le rebond — un utilisateur qui agit malgré un rebond mesuré
 *  ailleurs sur le même écran a bien travaillé, pas survolé. */
function verdictDeMesures(mesures: MesuresMesurees): 'travaille' | 'consulte' | 'survole' {
  if (mesures.actionRate.kind === 'measured' && mesures.actionRate.ratio >= TAUX_ACTION_MIN_TRAVAILLE) {
    return 'travaille'
  }
  if (mesures.bounceRate.kind === 'measured' && mesures.bounceRate.ratio >= TAUX_REBOND_MIN_SURVOLE) {
    return 'survole'
  }
  return 'consulte'
}

/**
 * Le verdict d'un écran qui a AU MOINS UNE VUE dans la fenêtre — qu'elle soit
 * publiable (`measures.kind === 'measured'`) ou retenue sous le seuil de
 * sessions distinctes.
 */
export function verdictEcranPresent(ecran: Pick<EcranMesureLigne, 'sessions' | 'measures'>): VerdictEcran {
  if (ecran.measures.kind === 'below_threshold') {
    return { kind: 'observations_insuffisantes', sessions: ecran.sessions, seuil: ecran.measures.minSessions }
  }
  return { kind: verdictDeMesures(ecran.measures) }
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Le verdict d'un écran ABSENT du rapport — zéro vue mesurée sur la fenêtre.
 *
 * `shippedAt` omis ou illisible → `non_mesure`, JAMAIS `jamais_ouvert` par
 * défaut : deviner serait exactement le verdict fabriqué que #1683.1 interdit.
 */
export function verdictEcranAbsent(opts: { shippedAt?: Date | string | null; now?: Date } = {}): VerdictEcran {
  const shippedAt = toDateOrNull(opts.shippedAt)
  if (!shippedAt) {
    return {
      kind: 'non_mesure',
      raison:
        'date de mise en service indisponible — impossible de distinguer un écran jamais ouvert d’un écran trop récent',
    }
  }
  const now = opts.now ?? new Date()
  const joursEcoules = Math.floor((now.getTime() - shippedAt.getTime()) / MS_PAR_JOUR)
  if (joursEcoules < GRACE_MISE_EN_SERVICE_JOURS) {
    return { kind: 'trop_recent', depuisJours: Math.max(joursEcoules, 0) }
  }
  return { kind: 'jamais_ouvert' }
}

/** Un écran du catalogue produit, réduit à ce que ce fichier a besoin de lire —
 *  jamais un import du type complet de `@bellum/contracts` pour deux champs. */
export type EcranCatalogue = { route: string; label: { fr: string; en: string } }

// Non exporté : `verdictsDesEcrans` le rend, mais chaque appelant (page.tsx,
// usage-demand-crossing.logic.ts) le consomme par inférence — aucun n'a
// besoin de nommer cette forme. Un type exporté sans second lecteur est le
// bruit que `pnpm lint:exports:types` (knip) refuse.
type LigneVerdictEcran = { route: string; label: { fr: string; en: string }; verdict: VerdictEcran }

/**
 * Un verdict PAR ÉCRAN DU CATALOGUE, jamais par écran du rapport : un écran
 * catalogué mais absent du rapport doit apparaître quand même, avec son
 * verdict d'absence — sinon un écran mort disparaîtrait de la liste au lieu
 * d'y figurer comme mort.
 *
 * `shippedAtParRoute` est optionnel et absent en production aujourd'hui (voir
 * le docblock de tête) : sans lui, tout écran absent reçoit `non_mesure`.
 */
export function verdictsDesEcrans(
  ecransProduit: readonly EcranCatalogue[],
  ecransMesures: readonly Pick<EcranMesureLigne, 'route' | 'sessions' | 'measures'>[],
  opts: { shippedAtParRoute?: (route: string) => Date | string | null | undefined; now?: Date } = {},
): LigneVerdictEcran[] {
  const parRoute = new Map(ecransMesures.map(ecran => [ecran.route, ecran]))
  return ecransProduit.map(ecran => {
    const present = parRoute.get(ecran.route)
    const verdict = present
      ? verdictEcranPresent(present)
      : verdictEcranAbsent({ shippedAt: opts.shippedAtParRoute?.(ecran.route) ?? null, now: opts.now })
    return { route: ecran.route, label: ecran.label, verdict }
  })
}

/** Les sept clés possibles d'un verdict, dans l'ORDRE où l'écran les affiche —
 *  jamais recalculé depuis les lignes : une clé absente d'ici serait un
 *  verdict que personne ne compterait. */
const TOUS_LES_KINDS: VerdictEcran['kind'][] = [
  'travaille',
  'consulte',
  'survole',
  'jamais_ouvert',
  'trop_recent',
  'observations_insuffisantes',
  'non_mesure',
]

/**
 * Le compte de chaque verdict, sur un ensemble de lignes — la preuve tenue en
 * une fonction que « les verdicts s'additionnent jusqu'au nombre d'écrans » :
 * `Object.values(compterVerdicts(lignes)).reduce((a,b)=>a+b,0) === lignes.length`
 * est vrai par construction (chaque ligne incrémente exactement UNE clé), pas
 * par discipline de qui affiche le résumé.
 */
export function compterVerdicts(lignes: readonly LigneVerdictEcran[]): Record<VerdictEcran['kind'], number> {
  const compte = Object.fromEntries(TOUS_LES_KINDS.map(kind => [kind, 0])) as Record<VerdictEcran['kind'], number>
  for (const ligne of lignes) compte[ligne.verdict.kind] += 1
  return compte
}

/** Le mot (ou la courte phrase) d'un verdict — jamais un chiffre nu à sa
 *  place : c'est tout l'objet de #1683.1. */
export function libelleVerdict(verdict: VerdictEcran): string {
  switch (verdict.kind) {
    case 'travaille':
      return 'travaillé'
    case 'consulte':
      return 'consulté'
    case 'survole':
      return 'survolé'
    case 'jamais_ouvert':
      return 'jamais ouvert'
    case 'trop_recent':
      return `trop récent (${verdict.depuisJours} j)`
    case 'observations_insuffisantes':
      return `observations insuffisantes (${verdict.sessions} sur ${verdict.seuil})`
    case 'non_mesure':
      return 'non mesuré'
  }
}
