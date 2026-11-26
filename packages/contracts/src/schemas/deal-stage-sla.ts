import { z } from 'zod'
import { PIPELINE_STAGES, type PipelineStage } from './project.js'

/**
 * LE SLA D'ÉTAPE DU PIPE — PDF 3 §3.5, ticket `BEL-CRM-203` PR5.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « [Spécification proposée] Chaque étape porte une durée cible, réglable par
 * espace. »
 *
 *   | Étape        | SLA par défaut | Au-delà                        |
 *   | qualifying   | 7 j            | intervention `deal_stage_aging` |
 *   | qualified    | 14 j           | idem                            |
 *   | proposing    | 7 j            | idem                            |
 *   | negotiating  | 21 j           | idem                            |
 *
 * « Le SLA n'est pas une contrainte, c'est un révélateur. Il dit où le pipe
 * coince, pas qui est en retard. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES NOMS DE LA SOURCE ET CEUX DU DÉPÔT
 * ─────────────────────────────────────────────────────────────────────────────
 * La source nomme ses quatre étapes en anglais générique ; le dépôt a les
 * siennes depuis `PROJECT_STAGES`. La correspondance est un pour un, dans
 * l'ordre, et elle est écrite ici pour qu'on n'ait pas à la redeviner :
 *
 *   `qualifying`  → `qualified`            (on qualifie)   ·  7 j
 *   `qualified`   → `confirmed`            (besoin exprimé) · 14 j
 *   `proposing`   → `profiles_submitted`   (profils présentés) · 7 j
 *   `negotiating` → `negotiation`          (négociation)   · 21 j
 *
 * #4338.1 (19/10/2026) — le pipe lit désormais `confirmed` AVANT `qualified`.
 * Les durées restent attachées à la VALEUR stockée, pas à la position : aucun
 * SLA d'affaire existante ne change avec la permutation des colonnes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ VIT CE RÉGLAGE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le DÉFAUT vit dans ce fichier, et nulle part ailleurs (GA-26). Le RÉGLAGE
 * d'un espace vit dans la table `deal_stage_sla`, une ligne par étape réglée —
 * une ligne absente veut dire « le défaut », jamais « zéro jour ».
 *
 * ⚠️ Pourquoi une table et non une colonne de plus sur `pipeline_stage_labels`,
 * qui est déjà le réglage par espace d'une étape : `label` y est `NOT NULL`, si
 * bien qu'un espace ne pourrait régler un SLA qu'en renommant l'étape. Deux
 * réglages indépendants forcés de voyager ensemble finissent par se contredire.
 */

/** Les bornes d'un réglage d'espace. Hors bornes = ignoré, jamais tronqué. */
export const DEAL_STAGE_SLA_BOUNDS = { min: 1, max: 365 } as const

/**
 * LES DURÉES CIBLES PAR DÉFAUT, en jours.
 *
 * `won` vaut `null` et c'est une décision : une affaire signée ne « vieillit »
 * pas dans sa colonne. Lui donner un seuil ferait clignoter le board sur des
 * affaires gagnées, et un board qui clignote partout ne signale plus rien —
 * c'est exactement la raison pour laquelle `MISSION_BOARD_STALE_DAYS` laisse
 * `en_cours` et `terminee` sans seuil.
 */
export const DEAL_STAGE_SLA_DEFAULTS: Readonly<Record<PipelineStage, number | null>> = {
  /** `qualifying` — sept jours pour décider si ça vaut le coup. */
  qualified: 7,
  /** `qualified` — deux semaines pour transformer un besoin exprimé en shortlist. */
  confirmed: 14,
  /** `proposing` — sept jours d'attente d'un retour sur des profils envoyés. */
  profiles_submitted: 7,
  /** `negotiating` — trois semaines, le seul seuil long : une négociation passe
   *  par des cycles de validation qui ne dépendent pas de nous. */
  negotiation: 21,
  /** Gagnée : plus rien à surveiller. */
  won: null,
}

/** Ce qu'un espace a réglé. Une étape absente prend son défaut. */
export const dealStageSlaOverridesSchema = z.record(z.string(), z.number())
export type DealStageSlaOverrides = Partial<Record<PipelineStage, number>>

export const stageSlaSchema = z.object({
  /** La durée cible en vigueur, ou `null` si l'étape n'en a pas. */
  days: z.number().int().positive().nullable(),
  /** Vrai quand c'est le défaut du produit, faux quand l'espace l'a réglée. */
  isDefault: z.boolean(),
})
export type StageSla = z.infer<typeof stageSlaSchema>

/** Un réglage utilisable : entier, dans les bornes. Rien d'autre. */
function usableOverride(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const days = Math.trunc(value)
  if (days < DEAL_STAGE_SLA_BOUNDS.min || days > DEAL_STAGE_SLA_BOUNDS.max) return null
  return days
}

/**
 * La durée cible EN VIGUEUR pour une étape, dans un espace.
 *
 * ⚠️ Une étape dont le défaut est `null` (`won`) ne devient jamais réglable :
 * accepter un réglage dessus ferait apparaître « en retard » sur une affaire
 * signée, ce qui n'a aucun sens et détruirait la confiance dans le signal.
 */
export function effectiveStageSla(stage: PipelineStage, overrides: DealStageSlaOverrides): StageSla {
  const fallback = DEAL_STAGE_SLA_DEFAULTS[stage]
  if (fallback === null) return { days: null, isDefault: true }
  const custom = usableOverride(overrides[stage])
  return custom === null ? { days: fallback, isDefault: true } : { days: custom, isDefault: false }
}

export const dealStageAgingSchema = z.object({
  /**
   * Depuis combien de jours l'affaire est à cette étape.
   *
   * `null` = NON MESURÉ, et c'est le piège que cette forme existe pour fermer :
   * un deal sans date d'entrée n'est pas « à 0 jour ». Un zéro se lirait « il
   * vient d'arriver » — l'inverse exact de ce qu'on sait, qui est rien.
   */
  days: z.number().int().nonnegative().nullable(),
  /** La durée cible en vigueur. `null` sur une étape qui n'en a pas. */
  slaDays: z.number().int().positive().nullable(),
  /**
   * Au-delà de la durée cible ? `null` quand la question ne se pose pas — pas
   * de date d'entrée, ou pas de durée cible. Jamais `false` par défaut : « pas
   * en retard » est une affirmation, et on ne l'affirme pas sans mesure.
   */
  overdue: z.boolean().nullable(),
})
export type DealStageAging = z.infer<typeof dealStageAgingSchema>

/**
 * L'ÂGE D'ÉTAPE d'une affaire, et son verdict.
 *
 * PURE. Le nom de l'intervention que la source demande au-delà du seuil est
 * `deal_stage_aging` ; au dépôt elle existe déjà sous son nom anglais
 * `project_no_decision` (`INTERVENTION_KINDS`), qui ouvre la ligne dans la file
 * du responsable. Ce contrat-ci ne la double pas : il donne la MESURE, elle
 * donne le geste.
 */
export function dealStageAging(input: {
  stage: PipelineStage
  stageEnteredAt: Date | string | null | undefined
  now: Date
  overrides: DealStageSlaOverrides
}): DealStageAging {
  const sla = effectiveStageSla(input.stage, input.overrides)
  const days = daysSince(input.stageEnteredAt, input.now)
  return {
    days,
    slaDays: sla.days,
    overdue: days === null || sla.days === null ? null : days > sla.days,
  }
}

/**
 * Jours pleins écoulés, ou `null`.
 *
 * Une date absente, illisible ou dans le FUTUR rend `null` : un âge négatif
 * n'existe pas, et le ramener à zéro affirmerait « vient d'arriver » sur une
 * ligne dont la date est simplement fausse.
 */
function daysSince(value: Date | string | null | undefined, now: Date): number | null {
  if (value === null || value === undefined || value === '') return null
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (Number.isNaN(at)) return null
  const elapsed = now.getTime() - at
  if (elapsed < 0) return null
  return Math.floor(elapsed / 86_400_000)
}

/** Les étapes réellement réglables — celles qui ont une durée cible. Dérivée,
 *  jamais retapée : une seconde liste divergerait au premier défaut changé. */
export const SLA_TUNABLE_STAGES: readonly PipelineStage[] = PIPELINE_STAGES.filter(
  stage => DEAL_STAGE_SLA_DEFAULTS[stage] !== null,
)
