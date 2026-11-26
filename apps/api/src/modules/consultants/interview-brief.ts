import type { Consultant, ConsultantMatch, InterviewBrief } from '@bellum/contracts'
import type { MatchTarget } from './consultant-matching'
import { buildConsultantBrief } from './consultant-brief'

/**
 * #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN, distinct du brief de
 * soutenance (`buildConsultantBrief`) : celui-là prépare une DÉFENSE écrite,
 * celui-ci prépare la RENCONTRE — objectif, pitch, deux expériences, ce qui
 * manque, les objections probables, des questions prêtes pour le consultant.
 *
 * Déterministe, sans invention : les objections sont reprises de
 * `buildConsultantBrief` (mêmes risques du match, pas reformulés deux fois
 * différemment) ; `gaps` vient directement du match (`ConsultantMatch.gaps`),
 * un champ SÉPARÉ des risques — ce qui manque n'est pas ce qui peut coincer.
 *
 * Les PARTICIPANTS et les informations LOGISTIQUES (#2189.24/.30) ne sont pas
 * dérivés ici : ils viennent de l'entretien PLANIFIÉ (`Interview`, déjà
 * exposé par `GET /submissions/:id/interviews`) — cette fonction ne les
 * invente pas quand aucun entretien n'est encore programmé.
 */
export function buildInterviewBrief(
  consultant: Consultant,
  target: MatchTarget,
  match: ConsultantMatch,
): InterviewBrief {
  const objections = buildConsultantBrief(consultant, target, match).objections

  const pitchParts = [consultant.title ?? 'Consultant']
  if (consultant.years_experience) pitchParts.push(`${consultant.years_experience} ans d’expérience`)
  if (consultant.stack.length > 0) pitchParts.push(`sur ${consultant.stack.slice(0, 3).join(', ')}`)

  return {
    consultantName: consultant.full_name,
    objective: `Convaincre que ${consultant.full_name ?? 'ce profil'} est le bon choix pour « ${target.label} ».`,
    pitch: `${pitchParts.join(', ')}.`,
    keyExperiences: consultant.references.slice(0, 2),
    gaps: match.gaps,
    objections,
    consultantQuestions: [...STANDARD_CONSULTANT_QUESTIONS],
  }
}

/** Un gabarit de bonnes pratiques d'entretien — jamais une donnée inventée sur
 *  le client visé, seulement des questions génériques qu'un consultant a
 *  intérêt à poser avant de s'engager. */
const STANDARD_CONSULTANT_QUESTIONS = [
  'Quels sont les livrables attendus dans les 30 premiers jours ?',
  'Qui sera mon interlocuteur principal au quotidien ?',
  'Quel est le processus de décision après cet entretien ?',
] as const
