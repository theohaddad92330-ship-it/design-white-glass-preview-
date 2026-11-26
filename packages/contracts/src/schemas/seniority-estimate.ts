import { consultantSenioritySchema, type ConsultantSeniority } from './consultant.js'

/**
 * #4016 L4.3 — la séniorité DÉDUITE des années d'expérience (décision Louis
 * 11/10/2026, `c95_estimation_badgee`).
 *
 * Une fiche dont personne n'a posé la séniorité (`inconnu`) mais dont les
 * années d'expérience sont saisies affiche la TRANCHE que ces années portent,
 * badgée « estimé ». Les seuils sont ceux du marché ESN (tranché sans Louis,
 * 11/10) : moins de 3 ans junior, 3 à 7 confirmé, 8 à 14 senior, 15 et plus
 * expert.
 *
 * Calculée À LA LECTURE, jamais écrite : `consultants.seniority` garde `inconnu`
 * (c28 — la séniorité saisie ou lue sur le CV reste la seule vérité stockée), et
 * une valeur saisie GAGNE toujours, même quand les années disent autre chose.
 */
export function estimateSeniorityFromYears(years: number | null | undefined): ConsultantSeniority | null {
  if (years == null || !Number.isFinite(years) || years < 0) return null
  if (years < 3) return 'junior'
  if (years < 8) return 'confirme'
  if (years < 15) return 'senior'
  return 'expert'
}

/** Ce qu'un écran affiche pour la séniorité d'une fiche, et s'il doit le badger « estimé ». */
export function displayedSeniority(row: { seniority: string; years_experience?: number | null }): {
  value: ConsultantSeniority
  estimated: boolean
} {
  const declared = consultantSenioritySchema.safeParse(row.seniority)
  if (declared.success && declared.data !== 'inconnu') return { value: declared.data, estimated: false }
  const estimate = estimateSeniorityFromYears(row.years_experience)
  return estimate ? { value: estimate, estimated: true } : { value: 'inconnu', estimated: false }
}
