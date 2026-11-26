import { z } from 'zod'
import { esnPresenceCertaintySchema } from './partner.js'

/**
 * #2122.20-.27 / #2316.10 — LE VOCABULAIRE DES RELATIONS D'ÉCOSYSTÈME. NEUF,
 * ET NEUF SEULEMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE FERMÉE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La section « Écosystème & accès » répond à trois questions : qui gravite
 * autour de ce compte, qu'est-ce que ça change, par où j'entre. Les deux
 * premières n'ont de réponse utile que si le lien porte un NOM : « ALTEN est
 * là » ne dit pas s'il faut l'attaquer, passer par lui, ou se placer derrière
 * lui. Neuf noms, écrits une fois, tenus par une garde.
 *
 * ⚠️ **Ce vocabulaire ÉTEND, il ne renomme rien** (#2122.5 / .6). Les axes
 * d'adressabilité `path` et `relation` ({@link ADDRESSABILITY_AXES}) gardent
 * leur clé, et {@link PARTNER_RELATIONSHIPS} (`partner` | `competitor` |
 * `unknown`) reste ce qu'une ESN est POUR NOUS. Les neuf types disent autre
 * chose : ce que la relation EST, et sur quoi on le sait.
 *
 * L'ordre est celui du retour, et il est ADDITIF (GA-08) : un type ne s'insère
 * jamais au milieu, il s'ajoute à la fin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `rank2_potential` (#2316.10) — TRANCHÉ SANS LOUIS (26/09/2026, nuit)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un manque réel, déjà identifié avant cette nuit : un rang 2 SANS preuve
 * attachée retombait sur l'hypothèse générique (`partner_potential` /
 * `competitor_potential`) et perdait l'information de rang — un commercial
 * lisait « partenaire potentiel » là où le retour #2316 demande de voir
 * « voie de rang 2 ». L'ajout est additif (à la fin, GA-08), ne renomme et ne
 * retire rien des huit types existants, et reste une HYPOTHÈSE : il n'entre
 * PAS dans {@link ASSERTING_TYPES}, une voie de rang 2 non confirmée n'ayant
 * pas le droit d'affirmer. Les quatre autres types demandés par #2316
 * (`observed_market`, `current_public_link`, `workspace_declared`,
 * `supplier_candidate`) restent HORS de cette nuit : chacun a un concept
 * déjà nommé dans ce vocabulaire (`historic_observed`, `current_sourced`,
 * `team_declared`) ou n'a aucune dérivation qui le produirait (un type sans
 * appelant serait du code que personne n'appelle) — les ajouter sans cette
 * dérivation romprait la garde sans rien livrer de vrai.
 */
export const ECOSYSTEM_RELATION_TYPES = [
  /** Concurrent potentiel — une hypothèse, pas un constat. */
  'competitor_potential',
  /** Partenaire potentiel — idem, vue de l'autre côté. */
  'partner_potential',
  /** Rang 1 déclaré — quelqu'un l'a dit, et on sait qui. */
  'rank1_declared',
  /** Rang 2 confirmé — la confirmation est le fait, pas le rang. */
  'rank2_confirmed',
  /** Plateforme d'intermédiation — l'entrée passe par un tiers, pas par l'ESN. */
  'intermediation_platform',
  /** Relation historique observée — elle a existé ; elle n'existe plus forcément. */
  'historic_observed',
  /** Relation actuelle sourcée — au présent, et avec la source qui le dit. */
  'current_sourced',
  /** Relation déclarée par l'équipe — la parole de l'espace, qui vaut preuve. */
  'team_declared',
  /** Rang 2 potentiel — un rang 2 SANS preuve attachée : une hypothèse à
   *  qualifier, jamais une confirmation (#2316.10). */
  'rank2_potential',
] as const
export const ecosystemRelationTypeSchema = z.enum(ECOSYSTEM_RELATION_TYPES)
export type EcosystemRelationType = (typeof ECOSYSTEM_RELATION_TYPES)[number]

/**
 * #2122.63 — LES SIX ACTIONS, NOMMÉES À UN SEUL ENDROIT.
 *
 * « Au moins une action par relation affichée » (#2122.48) n'est tenable que si
 * la liste des actions vit ailleurs que dans le JSX : deux écrans qui les
 * réécrivent chacun de leur côté en oublient une, et c'est toujours la même —
 * « Marquer non pertinent », la seule qui ferme une carte.
 */
export const ECOSYSTEM_RELATION_ACTIONS = [
  'qualify',
  'find_sales_reps',
  'prepare_partner_approach',
  'mark_competitor',
  'mark_irrelevant',
  'add_field_note',
] as const
export type EcosystemRelationAction = (typeof ECOSYSTEM_RELATION_ACTIONS)[number]

/**
 * La preuve ATTACHÉE à une relation — ce qui autorise une phrase à affirmer.
 *
 * `observed_at` peut être `null` : une source qui ne se date pas se dit
 * « sans date », jamais avec la date du jour, qui rajeunirait l'information à
 * chaque lecture.
 */
export const ecosystemRelationProofSchema = z.object({
  /** Le DÉTAIL lisible de la preuve (« TMA du portail depuis 2024 »). `null`
   *  quand la source n'en porte aucun : l'écran montre alors la source seule,
   *  jamais une phrase de remplissage. */
  label: z.string().nullable(),
  /** La CLÉ de l'origine (`workspace_declared`, `market_observation`,
   *  `current_inference`, `declared_subcontracting`) — traduite à l'écran par
   *  les libellés qui existent déjà. Jamais du français dans un contrat. */
  source: z.string(),
  observed_at: z.string().nullable(),
})
export type EcosystemRelationProof = z.infer<typeof ecosystemRelationProofSchema>

/**
 * #2122.35 — DEUX SOURCES QUI DIVERGENT S'AFFICHENT TOUTES LES DEUX.
 *
 * Arbitrer en silence, c'est choisir pour le commercial sans qu'il le sache —
 * et sur un lien commercial entre deux tiers, se tromper coûte un rendez-vous.
 * La divergence est donc une DONNÉE de la relation, pas un cas d'erreur.
 */
export const ecosystemRelationDivergenceSchema = z.object({
  source: z.string(),
  statement: z.string(),
  observed_at: z.string().nullable(),
})
export type EcosystemRelationDivergence = z.infer<typeof ecosystemRelationDivergenceSchema>

/**
 * #2122.53-.55 — LA CORRECTION HUMAINE : QUI, QUAND, ET CE QU'ELLE REMPLACE.
 *
 * `corrected_by` est `null` quand l'auteur n'est pas connu du client : l'écran
 * dit alors « par l'équipe de l'espace ». Un nom inventé serait pire qu'un nom
 * absent — c'est une ATTRIBUTION, elle se relit six mois plus tard.
 */
export const ecosystemRelationCorrectionSchema = z.object({
  type: ecosystemRelationTypeSchema,
  corrected_at: z.string(),
  corrected_by: z.string().nullable(),
  /** Le type OBSERVÉ, celui d'avant toute correction. Il ne disparaît pas :
   *  « on archive, on ne supprime pas » (doctrine). */
  previous_type: ecosystemRelationTypeSchema,
})
export type EcosystemRelationCorrection = z.infer<typeof ecosystemRelationCorrectionSchema>

export const ecosystemRelationSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ecosystemRelationTypeSchema,
  /** `null` = aucune preuve attachée. La relation existe quand même — elle n'a
   *  simplement pas le droit d'AFFIRMER (voir {@link relationMayAssert}). */
  proof: ecosystemRelationProofSchema.nullable(),
  /** La confiance de la DÉTECTION. `null` sur une ligne saisie à la main :
   *  personne ne l'a évaluée, et la dire « faible » serait un jugement que nul
   *  n'a porté. */
  confidence: esnPresenceCertaintySchema.nullable(),
  /** #2122.33 — « Déduit par BellumAI ». Séparé VISUELLEMENT des faits sourcés
   *  côté écran ; ici, c'est le drapeau qui le permet. */
  deduced: z.boolean(),
  divergences: z.array(ecosystemRelationDivergenceSchema),
  correction: ecosystemRelationCorrectionSchema.nullable(),
})
export type EcosystemRelation = z.infer<typeof ecosystemRelationSchema>

/** Les cinq types qui AFFIRMENT un état. Les trois autres proposent une
 *  hypothèse, et une hypothèse ne se corrige pas par une preuve : elle se
 *  qualifie. */
const ASSERTING_TYPES: readonly EcosystemRelationType[] = [
  'rank1_declared',
  'rank2_confirmed',
  'historic_observed',
  'current_sourced',
  'team_declared',
]

/** Ce type AFFIRME-t-il quelque chose sur le compte ? */
export function relationTypeAsserts(type: EcosystemRelationType): boolean {
  return ASSERTING_TYPES.includes(type)
}

/**
 * #2122.37 — CETTE RELATION A-T-ELLE LE DROIT D'AFFIRMER ?
 *
 * « En place », « travaille chez eux », « est fournisseur », « accepte le rang
 * 2 » : quatre phrases qu'aucun écran ne doit pouvoir écrire sans preuve
 * attachée. Le prédicat est ici, la garde d'architecture
 * (`une-relation-naffirme-rien-sans-preuve.test.ts`) vérifie qu'aucun texte ne
 * le contourne.
 */
export function relationMayAssert(relation: Pick<EcosystemRelation, 'type' | 'proof'>): boolean {
  return relationTypeAsserts(relation.type) && relation.proof !== null
}

/**
 * #2122.62 — LA DÉRIVATION UNIQUE : « N ESN observées » ET « aucune ESN
 * présente » SORTENT DU MÊME APPEL.
 *
 * Le défaut qu'elle refuse est mesurable : la « densité d'écosystème » de
 * l'onglet Accès lit `esn_observed` (le corpus de parcours), la liste des ESN
 * lit `account_partners`. Deux sources, deux phrases, un même écran — et rien
 * n'empêchait « 3 ESN observées » de cohabiter avec « aucune ESN présente ».
 *
 * `observed` est `null`, jamais `0` : « on n'a rien observé » n'est pas « il
 * n'y a personne ». `none` est le PRÉDICAT, et les deux phrases le lisent —
 * c'est ce qui rend la contradiction impossible plutôt qu'improbable.
 *
 * Ne comptent que les relations qui ont le DROIT d'affirmer (.37) : une
 * hypothèse comptée gonflerait un nombre que le commercial répète en
 * rendez-vous.
 */
/**
 * #2316.15 — « N ESN observées » ET « aucune ESN actuelle » NE SE CONTREDISENT
 * PAS SI L'ÉCRAN LE DIT : la première compte l'HISTORIQUE (`historic_observed`),
 * la seconde l'ACTUEL (les quatre autres types qui affirment). Sans ce
 * troisième prédicat, un compte purement historique lirait « 8 relations
 * avérées » sans jamais dire qu'aucune n'est actuelle — exactement la
 * contradiction apparente que le retour signale.
 *
 * Sort du MÊME appel que `observed`/`none` : jamais un second calcul qui
 * pourrait diverger sur le même écran (.62).
 */
export function ecosystemPresence(relations: readonly Pick<EcosystemRelation, 'type' | 'proof'>[]): {
  observed: number | null
  none: boolean
  historicOnly: boolean
} {
  const asserting = relations.filter(relationMayAssert)
  const asserted = asserting.length
  return {
    observed: asserted > 0 ? asserted : null,
    none: asserted === 0,
    historicOnly: asserted > 0 && asserting.every(relation => relation.type === 'historic_observed'),
  }
}

/**
 * #2122.53-.55 — APPLIQUER UNE CORRECTION HUMAINE.
 *
 * Elle DOMINE immédiatement (le type rendu est le sien), elle est ATTRIBUÉE
 * (qui, quand), et elle n'efface PAS l'observation : `previous_type` garde le
 * fait OBSERVÉ — pas la correction d'avant. Corriger deux fois ne doit pas
 * faire disparaître ce que le pipeline avait vu, sinon la troisième correction
 * se ferait contre une correction, plus contre un fait.
 */
export function applyEcosystemCorrection(
  relation: EcosystemRelation,
  correction: { type: EcosystemRelationType; corrected_at: string; corrected_by: string | null },
): EcosystemRelation {
  const previous = relation.correction?.previous_type ?? relation.type
  return {
    ...relation,
    type: correction.type,
    correction: {
      type: correction.type,
      corrected_at: correction.corrected_at,
      corrected_by: correction.corrected_by,
      previous_type: previous,
    },
  }
}
