import type { Consultant, ConsultantBrief, ConsultantMatch } from '@bellum/contracts'
import type { MatchTarget } from './consultant-matching'

/**
 * Brief de soutenance d'un consultant (annexe méthodo p22 « Brief : consultant
 * connaît compte, besoin, interlocuteurs, objections et plan J+30 »).
 *
 * Déterministe, sans LLM, sans invention : tout dérive du consultant, du besoin
 * et du résultat du matching (ses raisons = forces, ses risques = objections à
 * préparer). Un document prêt à donner au consultant avant qu'il ne rencontre le
 * client — pour qu'il n'y aille pas à froid.
 */
export function buildConsultantBrief(
  consultant: Consultant,
  target: MatchTarget,
  match: ConsultantMatch,
): ConsultantBrief {
  const context = [
    target.sector ? `Compte du secteur « ${target.sector} »` : 'Compte',
    `besoin : ${target.label}`,
  ].join(' — ')

  // Forces = les raisons du match (déjà sourcées) + la stack/références déclarées.
  const strengths = [...match.reasons]
  if (consultant.stack.length > 0) strengths.push(`Compétences : ${consultant.stack.join(', ')}`)
  if (consultant.references.length > 0) {
    strengths.push(`Références citables : ${consultant.references.slice(0, 3).join(', ')}`)
  }

  // Objections = les risques du match, reformulés en « à préparer » — le
  // consultant doit avoir sa réponse AVANT que le client ne pose la question.
  const objections = match.risks.map(risk => `À anticiper : ${risk}`)
  if (objections.length === 0) {
    objections.push('Aucun risque détecté sur les données — préparer néanmoins la question du TJM et de la dispo.')
  }

  // Plan J+30 — jalons déterministes de prise de mission (p22 « plan J+30 »).
  const planJ30 = [
    'Semaine 1 : immersion — rencontrer les interlocuteurs, cadrer le périmètre et les livrables attendus.',
    'Semaine 2 : premier livrable intermédiaire pour valider la compréhension du besoin.',
    'Semaine 3-4 : montée en charge sur la mission, point d’avancement hebdomadaire avec le manager.',
    'J+30 : revue de mission — ce qui est fait, ce qui reste, ajustement du plan avec le client.',
  ]

  return {
    consultantName: consultant.full_name,
    context,
    strengths,
    objections,
    planJ30,
  }
}
