import { DISCOVER_PAGE_SIZE } from './discover-query'

/* ------------------------------------------------------------------ */
/*  #2291.9 — DÉCISION Louis 19/09/2026 (QCM du matin) : « la capacité       */
/*  commerciale adapte le volume de comptes PROPOSÉS ».                     */
/*                                                                     */
/*  La grille, telle que Louis l'a donnée : équipe commerciale 1 à 3        */
/*  personnes → 10 comptes proposés ; 4 à 8 → 25 ; 9 et plus → 50.          */
/*  Écrite UNE fois, ici — ni dans l'écran (`Discover.tsx`), ni côté        */
/*  backend (`apps/ia/app/routers/discover.py`), qui reçoit déjà un `limit` */
/*  explicite dans le corps de la requête et l'honore tel quel, sans le      */
/*  recalculer (GA-26 : un réglage vit à un seul endroit).                  */
/*                                                                     */
/*  La donnée réelle : `EsnAnswers.sales_team_size` — la réponse LIBRE      */
/*  (mais issue d'une liste fermée, `ESN_ANSWER_OPTIONS.sales_team_size`,   */
/*  `onboarding.ts`) déjà lue par l'écran (`useEsnProfile()`, branchée      */
/*  `Discover.tsx:318`). Aucune requête réseau de plus.                     */
/*                                                                     */
/*  Les SIX réponses réelles ne s'alignent pas exactement sur les TROIS     */
/*  paliers de Louis — deux jugements DOCUMENTÉS ici, jamais devinés en      */
/*  silence :                                                          */
/*   - « Je suis seul (fondateur / indépendant) » rejoint le palier 1-3 :    */
/*     c'est la plus petite équipe possible, pas une taille différente ;    */
/*   - « 8-15 personnes » rejoint le palier 9 et plus : Louis a fixé la      */
/*     borne haute du palier « 4-8 » à 8, et l'essentiel de cette tranche    */
/*     déclarée (9 à 15) la dépasse.                                        */
/*                                                                     */
/*  « Je n'ai pas d'équipe commerciale dédiée » NE REJOINT AUCUN palier :    */
/*  cette réponse ne dit PAS un effectif, elle dit qu'aucune équipe n'est    */
/*  dédiée — la confondre avec « seul » inventerait un chiffre. Non mesuré   */
/*  ≠ 0 (doctrine, GA-18/GA-19) : taille non déclarée (ou non mappable) ⇒    */
/*  le volume par défaut ACTUEL, inchangé (`DISCOVER_PAGE_SIZE`).           */
/* ------------------------------------------------------------------ */

/** Les trois paliers de la grille, dans le vocabulaire de Louis. */
export const SALES_TEAM_BANDS = ['oneToThree', 'fourToEight', 'nineOrMore'] as const
// Pas exporté : consommé seulement ici (`pnpm lint:exports:types`, knip) —
// `ProposedAccountVolume.band` en porte la forme pour les autres fichiers.
type SalesTeamBand = (typeof SALES_TEAM_BANDS)[number]

/**
 * Grille #2291.9 — écrite UNE fois.
 *
 * ⚠️ RENVERSEMENT DATÉ — #4016 L7, décision Louis 11/10/2026 : Découvrir SANS
 * PALIER (`c68_capacite_adapte_le_volume_propose`, réécrite). Ces volumes ne
 * sont plus un plafond mais le PREMIER LOT : « Voir 10 de plus »
 * (`discover-list-window.ts`) relance la recherche au-delà, jusqu'à la borne
 * TECHNIQUE `DISCOVER_MAX_LIMIT` (200), sans débit de crédit.
 */
export const PROPOSED_ACCOUNT_VOLUME_BY_BAND: Record<SalesTeamBand, number> = {
  oneToThree: 10,
  fourToEight: 25,
  // #4673.2 (Louis 31/10) — 50 → 100 : le moteur va jusqu'au volume demandé (#4673.1, #4419.1). Revient sur le
  // palier 50 de #2291.9 ; les autres paliers et le défaut ne bougent pas.
  nineOrMore: 100,
}

/**
 * Réponse RÉELLE (`ESN_ANSWER_OPTIONS.sales_team_size`, `onboarding.ts`) →
 * palier. Absente du mapping = ne rejoint aucun palier (voir le commentaire
 * d'en-tête pour « Je n'ai pas d'équipe commerciale dédiée »).
 */
const SALES_TEAM_BAND_BY_ANSWER: Partial<Record<string, SalesTeamBand>> = {
  'Je suis seul (fondateur / indépendant)': 'oneToThree',
  '2-3 personnes': 'oneToThree',
  '4-8 personnes': 'fourToEight',
  '8-15 personnes': 'nineOrMore',
  '15+ personnes': 'nineOrMore',
}

export interface ProposedAccountVolume {
  /** Combien de comptes proposer. */
  count: number
  /** Le palier retenu, `null` = taille non déclarée (ou non mappable) — la
   *  règle le dit, `count` vaut alors le défaut actuel, inchangé. */
  band: SalesTeamBand | null
}

/**
 * #2291.9 — le volume de comptes à proposer, depuis la taille d'équipe
 * commerciale DÉCLARÉE au profil. Jamais d'invention : une taille absente ou
 * non reconnue retombe sur `DISCOVER_PAGE_SIZE`, le défaut déjà en place.
 */
export function proposedAccountVolume(salesTeamSize: string | null | undefined): ProposedAccountVolume {
  const band = salesTeamSize ? SALES_TEAM_BAND_BY_ANSWER[salesTeamSize] : undefined
  if (!band) return { count: DISCOVER_PAGE_SIZE, band: null }
  return { count: PROPOSED_ACCOUNT_VOLUME_BY_BAND[band], band }
}

/**
 * #4673.2 (Louis 31/10) — la taille d'équipe règle TOUJOURS le volume, Neutre compris : revient sur #4304.1
 * (Neutre = volume fixe, 19/10). Le mode Neutre change ce qui PÈSE dans le rang, plus le nombre de comptes proposés.
 * Sans équipe déclarée : le défaut, inchangé.
 */
export function proposedVolumeForContext(
  _neutral: boolean,
  salesTeamSize: string | null | undefined,
): ProposedAccountVolume {
  return proposedAccountVolume(salesTeamSize)
}

/**
 * #3408 — « 25 comptes proposés » à côté de « 1 compte trouvé » : le volume
 * visé est une CIBLE, pas un résultat. Quand la recherche en a trouvé moins, le
 * nombre qui compte est celui trouvé (dit par les bandeaux de couverture /
 * recherche incomplète) — la phrase du volume se tait plutôt que de le contredire.
 */
export function volumeNoticeApplies(
  volume: ProposedAccountVolume,
  matched: number | null,
  /**
   * #3528.4 — ce qui est AFFICHÉ après filtres. « 25 comptes proposés » à côté de
   * « 0 entreprise trouvée » se contredit : le bandeau compte la liste visible, et
   * se masque quand elle est vide (le message d'écart des filtres reste).
   */
  shown: number | null = null,
): boolean {
  if (shown !== null && shown < volume.count) return false
  return matched === null || matched >= volume.count
}
