import { z } from 'zod'

/**
 * BEL-SC-238 (#3267, P0) — CE QUE L'ENTRETIEN APPREND, QUE LE CV NE PEUT PAS DIRE.
 *
 * L'audit de la spec (#3249, règle 1) a montré que la quasi-totalité des dix-huit
 * dimensions demandées vivent déjà ailleurs dans le dépôt, sous un autre nom : les
 * cinq verdicts nommés (`CONSULTANT_MATCH_VERDICTS`, consultant.ts), le must-have
 * jamais compensé (`deriveMatchVerdict`, match.ts), la distinction preuve/déclaratif
 * (`isSkillSourceProven`, talent.ts), le TJM, la langue, la mobilité, le
 * consentement, les restrictions client (axes `rate`/`language`/`location`/
 * `client_constraints`, match.ts), la disponibilité VÉRIFIÉE
 * (`availabilityCheckedAt`, talent.ts) — voir le commentaire de clôture #3267
 * pour le détail fichier par ligne. Deux dimensions seulement n'avaient AUCUNE
 * maison : la communication et l'autonomie observées en entretien, et le temps
 * avant efficacité annoncé sur une prise de poste. « Motivation » et « autres
 * processus » sont volontairement ABSENTS d'ici : ce sont des faits PAR
 * OPPORTUNITÉ (voir `talentPositioningAgreementSchema`, consultant.ts), jamais
 * des faits globaux sur la personne — les y ajouter aurait dupliqué un objet qui
 * existe déjà, ce que l'instruction commune interdit (règle 4).
 *
 * ⚠️ SOURCE UNIQUE : 'interview'. Jamais dérivées d'un CV, jamais une
 * auto-déclaration du talent — la même garde que {@link isSkillSourceProven}
 * (`talent.ts`) et pour la même raison : un CV ne prouve ni un comportement en
 * entretien ni une durée d'adaptation, seul l'entretien le peut. `source` est un
 * littéral, pas un enum : une valeur différente refuse le parsing plutôt que de
 * laisser une future colonne "CV" s'y glisser.
 *
 * Trois crans NOMMÉS pour un trait — jamais un chiffre (doctrine « aucune
 * probabilité », refusée six fois) — et AUCUN « inconnu » parmi eux : l'absence
 * d'évaluation ne s'écrit pas comme un quatrième niveau, elle s'écrit par
 * l'ABSENCE d'entrée dans le tableau ({@link talentInterviewGaps}). Un niveau
 * inventé en absence d'entretien serait une évaluation que personne n'a faite.
 */

export const TALENT_INTERVIEW_TRAITS = ['communication', 'autonomy'] as const
export const talentInterviewTraitKindSchema = z.enum(TALENT_INTERVIEW_TRAITS)
export type TalentInterviewTraitKind = (typeof TALENT_INTERVIEW_TRAITS)[number]

export const TALENT_TRAIT_LEVELS = ['a_developper', 'solide', 'fort'] as const
export const talentTraitLevelSchema = z.enum(TALENT_TRAIT_LEVELS)
export type TalentTraitLevel = (typeof TALENT_TRAIT_LEVELS)[number]

export const talentInterviewTraitSchema = z.object({
  trait: talentInterviewTraitKindSchema,
  level: talentTraitLevelSchema,
  source: z.literal('interview'),
  note: z.string().nullable(),
  recordedAt: z.string(),
  recordedByName: z.string().nullable(),
})
export type TalentInterviewTrait = z.infer<typeof talentInterviewTraitSchema>

export const recordTalentInterviewTraitSchema = z
  .object({
    trait: talentInterviewTraitKindSchema,
    level: talentTraitLevelSchema,
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
export type RecordTalentInterviewTraitInput = z.infer<typeof recordTalentInterviewTraitSchema>

/**
 * Le temps avant efficacité annoncé — une DURÉE, pas un niveau de qualité :
 * schéma distinct de {@link talentTraitLevelSchema} plutôt qu'un troisième sens
 * prêté aux mêmes trois mots.
 */
export const RAMP_UP_BANDS = ['immediat', 'jours', 'semaines', 'mois'] as const
export const rampUpBandSchema = z.enum(RAMP_UP_BANDS)
export type RampUpBand = (typeof RAMP_UP_BANDS)[number]

export const talentRampUpSchema = z.object({
  band: rampUpBandSchema,
  note: z.string().nullable(),
  recordedAt: z.string(),
  recordedByName: z.string().nullable(),
})
export type TalentRampUp = z.infer<typeof talentRampUpSchema>

export const recordTalentRampUpSchema = z
  .object({
    band: rampUpBandSchema,
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
export type RecordTalentRampUpInput = z.infer<typeof recordTalentRampUpSchema>

/** Le sous-ensemble de la fiche dont dépend {@link talentInterviewGaps}. */
export type TalentInterviewAssessmentInput = {
  interviewTraits: readonly TalentInterviewTrait[]
  rampUp: TalentRampUp | null
}

/**
 * Ce qui n'a PAS encore été évalué en entretien — NOMMÉ, jamais tu (doctrine
 * GA-18/19 : un axe non évaluable sort du dénominateur, il ne devient pas un
 * zéro, et il ne disparaît pas non plus). Un tableau vide est un fait MESURÉ
 * (« tout a été évalué en entretien »), pas une absence de vérification.
 */
export function talentInterviewGaps(input: TalentInterviewAssessmentInput): Array<TalentInterviewTraitKind | 'rampUp'> {
  const assessed = new Set(input.interviewTraits.map(trait => trait.trait))
  const gaps: Array<TalentInterviewTraitKind | 'rampUp'> = TALENT_INTERVIEW_TRAITS.filter(trait => !assessed.has(trait))
  if (!input.rampUp) gaps.push('rampUp')
  return gaps
}
