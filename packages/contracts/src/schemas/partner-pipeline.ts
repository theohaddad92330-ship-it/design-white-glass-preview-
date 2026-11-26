import { z } from 'zod'

/**
 * Le canal PARTENAIRE (tome 4, partie C) — l'autre moitié du marché.
 *
 * Pour une ESN de moins de vingt consultants, le partenaire est souvent le
 * premier canal de revenu : plus rapide, moins verrouillé, et l'interlocuteur
 * est un pair. Le cycle n'a rien de commun avec celui d'un compte client, et
 * c'est ce qui justifie un objet distinct (D61) :
 *
 * | Compte client | Partenaire |
 * | --- | --- |
 * | se qualifie en BTMMP | se qualifie en capacité, ouverture, fiabilité |
 * | produit des PROJETS | produit un FLUX de besoins |
 * | se gagne ou se perd | s'entretient — l'étape 6 est un régime, pas une fin |
 *
 * ⚠️ Trois objets portent le mot « partenaire » dans ce dépôt, et les confondre
 * serait la faute de conception du chantier :
 * - `account_partners` — quelles ESN sont en place CHEZ un compte client ;
 * - `esn_directory` — l'ENTITÉ ESN, partagée entre espaces ;
 * - `partner_relations` (ici) — MA relation avec cette ESN, privée à mon espace.
 */

/** Les huit étapes du §11. L'étape 6 est un RÉGIME, pas une fin de cycle. */
export const PARTNER_STAGES = [
  'identifie',
  'qualifie',
  'contacte',
  'en_discussion',
  'cadre_signe',
  'flux_actif',
  'dormant',
  'retire',
] as const
export type PartnerStage = (typeof PARTNER_STAGES)[number]

/** Ce que cette ESN est POUR NOUS. Une même ESN peut porter les trois. */
export const PARTNER_ROLES = ['concurrent', 'client', 'fournisseur'] as const
export type PartnerRole = (typeof PARTNER_ROLES)[number]

export const PARTNER_RECOMMENDATIONS = ['renforcer', 'maintenir', 'reduire', 'viser_rang_1'] as const
export type PartnerRecommendation = (typeof PARTNER_RECOMMENDATIONS)[number]

/** Les cinq axes du §23. Ils ne mesurent QUE de la donnée interne. */
export const PARTNER_SCORE_AXES = ['volume', 'fiabilite', 'marge', 'acces', 'reciprocite'] as const
export type PartnerScoreAxis = (typeof PARTNER_SCORE_AXES)[number]

export const PARTNER_AXIS_MAX: Record<PartnerScoreAxis, number> = {
  volume: 25,
  fiabilite: 20,
  marge: 20,
  acces: 25,
  reciprocite: 10,
}

/** Sous ce nombre de placements, la relation n'a pas d'histoire à mesurer. */
export const PARTNER_MIN_PLACEMENTS = 3

export const partnerRelationSchema = z.object({
  id: z.string(),
  /** Le SIREN fait le lien avec `esn_directory`. Jamais une copie du nom. */
  siren: z.string().nullable(),
  name: z.string(),
  stage: z.enum(PARTNER_STAGES),
  roles: z.array(z.enum(PARTNER_ROLES)),
  needsReceived90d: z.number().int().nonnegative(),
  placementsActive: z.number().int().nonnegative(),
  placementsTotal: z.number().int().nonnegative(),
  /** Leur avons-nous confié des besoins en retour ? */
  needsGiven90d: z.number().int().nonnegative(),
  lastActivityAt: z.string().nullable(),
  contactName: z.string().nullable(),
  notes: z.string().nullable(),
})
export type PartnerRelation = z.infer<typeof partnerRelationSchema>

export interface PartnerScoreInput {
  needsReceived12m: number | null
  missionsCompleted: number | null
  missionsTotal: number | null
  /** Marge moyenne APRÈS commission, en points de pourcentage. */
  averageMarginPct: number | null
  /** Comptes finaux qu'il ouvre et que nous n'avons pas. */
  accountsOpened: number | null
  needsGiven12m: number | null
  placementsTotal: number
  /** Le partenaire est-il AUSSI un client à nous ? */
  isAlsoClient?: boolean
  /** Le compte final porte-t-il une clause de non-sollicitation ? */
  nonSolicitation?: boolean
  /** Des preuves suffisantes pour se présenter en direct ? */
  hasProof?: boolean
  /** Une relation directe avec au moins un décideur du client final ? */
  hasDirectDecisionMaker?: boolean
}

export interface PartnerScoreAxisResult {
  axis: PartnerScoreAxis
  points: number | null
  max: number
  evidence: string
}

export interface PartnerRelationScore {
  score: number | null
  scoreMax: number
  axes: PartnerScoreAxisResult[]
  unmeasured: PartnerScoreAxis[]
  reason: string | null
  recommendation: PartnerRecommendation | null
  /** Pourquoi « viser le rang 1 » est refusé, quand il l'est. */
  rank1Blocked: string | null
}

function axis(key: PartnerScoreAxis, points: number | null, evidence: string): PartnerScoreAxisResult {
  return { axis: key, points, max: PARTNER_AXIS_MAX[key], evidence }
}

/**
 * Le score partenaire — « est-ce un bon partenaire ? »
 *
 * À ne jamais confondre avec le débordement, qui répond à « a-t-il besoin de
 * moi maintenant ? ». Un partenaire excellent peut n'avoir aucun besoin cette
 * semaine, et une ESN qu'on ne connaît pas peut déborder aujourd'hui.
 *
 * Il ne dépend d'AUCUNE source publique : il se construit avec l'usage. Sur une
 * relation neuve, il n'existe pas — et l'écran le dit (« pas encore assez
 * d'historique, reviens après trois placements ») plutôt que d'afficher un
 * zéro qui se lirait « mauvais partenaire ».
 */
/**
 * ⚠️ Le nom porte `Relation` parce qu'un `partnerScore` existe déjà : celui
 * d'`account_partners`, qui note une ESN EN PLACE chez un compte client (rang,
 * relation, placements). Deux scores, deux questions — les appeler pareil
 * ferait importer l'un pour l'autre sans qu'aucun test ne tombe.
 */
export function partnerRelationScore(input: PartnerScoreInput): PartnerRelationScore {
  if (input.placementsTotal < PARTNER_MIN_PLACEMENTS) {
    return {
      score: null,
      scoreMax: 0,
      axes: [],
      unmeasured: [...PARTNER_SCORE_AXES],
      reason: `Pas encore assez d'historique — ${input.placementsTotal} placement(s) sur les ${PARTNER_MIN_PLACEMENTS} nécessaires.`,
      recommendation: null,
      rank1Blocked: null,
    }
  }

  const axes: PartnerScoreAxisResult[] = [
    input.needsReceived12m === null
      ? axis('volume', null, 'Aucun besoin reçu enregistré sur douze mois')
      : axis(
          'volume',
          Math.min(PARTNER_AXIS_MAX.volume, input.needsReceived12m * 2),
          `${input.needsReceived12m} besoin(s) confié(s) sur douze mois`,
        ),
    input.missionsCompleted === null || !input.missionsTotal
      ? axis('fiabilite', null, 'Aucune mission terminée à comparer')
      : axis(
          'fiabilite',
          Math.round((input.missionsCompleted / input.missionsTotal) * PARTNER_AXIS_MAX.fiabilite),
          `${input.missionsCompleted} mission(s) menée(s) à terme sur ${input.missionsTotal}`,
        ),
    input.averageMarginPct === null
      ? axis('marge', null, 'Marge non connue')
      : axis(
          'marge',
          Math.max(0, Math.min(PARTNER_AXIS_MAX.marge, Math.round(input.averageMarginPct))),
          `${Math.round(input.averageMarginPct)} % de marge moyenne après commission`,
        ),
    input.accountsOpened === null
      ? axis('acces', null, 'Comptes ouverts par ce partenaire non recensés')
      : axis(
          'acces',
          Math.min(PARTNER_AXIS_MAX.acces, input.accountsOpened * 5),
          `${input.accountsOpened} compte(s) final(aux) qu'il ouvre et que nous n'avions pas`,
        ),
    input.needsGiven12m === null
      ? axis('reciprocite', null, 'Besoins confiés en retour non recensés')
      : axis(
          'reciprocite',
          Math.min(PARTNER_AXIS_MAX.reciprocite, input.needsGiven12m * 2),
          `${input.needsGiven12m} besoin(s) confié(s) en retour`,
        ),
  ]

  const measured = axes.filter(item => item.points !== null)
  const unmeasured = axes.filter(item => item.points === null).map(item => item.axis)
  if (measured.length === 0) {
    return {
      score: null,
      scoreMax: 0,
      axes,
      unmeasured,
      reason: 'Aucun axe mesurable — la relation existe, son histoire n’est pas enregistrée.',
      recommendation: null,
      rank1Blocked: null,
    }
  }

  const scoreMax = measured.reduce((sum, item) => sum + item.max, 0)
  const raw = measured.reduce((sum, item) => sum + (item.points ?? 0), 0)
  const score = Math.round((raw / scoreMax) * 100)
  const reliability = axes.find(item => item.axis === 'fiabilite')?.points ?? null
  const access = axes.find(item => item.axis === 'acces')?.points ?? null

  // « Viser le rang 1 » — deux gardes DURES, et elles ne se négocient pas :
  // court-circuiter un partenaire qui nous a ouvert la porte se fait une fois,
  // et coûte le canal entier.
  let rank1Blocked: string | null = null
  if (input.nonSolicitation) rank1Blocked = 'Le compte final porte une clause de non-sollicitation.'
  else if (input.isAlsoClient) rank1Blocked = 'Ce partenaire est aussi notre client — on ne le contourne pas.'

  // ⚠️ Pas de `??` ici, sur AUCUNE des deux bornes. Un repli numérique
  // ment dans les deux sens : il choisit aujourd'hui une valeur qui refuse
  // (`100` pour une marge qu'on veut BASSE, `0` pour un accès qu'on veut
  // HAUT), mais rien n'empêche quelqu'un de le remplacer demain par une
  // valeur qui, elle, ferait PASSER un axe inconnu — une marge ou un accès
  // qu'on n'a jamais mesurés se liraient alors comme excellents. La forme
  // explicite ne peut pas se tromper de sens : « inconnu » n'entre dans
  // aucune comparaison, quelle que soit la valeur choisie pour le dire.
  const canRank1 =
    !rank1Blocked &&
    access !== null &&
    access >= 20 &&
    input.averageMarginPct !== null &&
    input.averageMarginPct <= 10 &&
    input.hasProof === true &&
    input.hasDirectDecisionMaker === true

  const recommendation: PartnerRecommendation = canRank1
    ? 'viser_rang_1'
    : score < 50 || (reliability !== null && reliability < 8)
      ? 'reduire'
      : score >= 70
        ? 'renforcer'
        : 'maintenir'

  return { score, scoreMax, axes, unmeasured, reason: null, recommendation, rank1Blocked }
}
