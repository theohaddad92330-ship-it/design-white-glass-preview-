import type { MatchExplanation, MatchNeed, MatchResult } from '@bellum/contracts'
import { isDisplayOnlyMatchAxis, matchScoreIsMeasured, MIN_AXES_FOR_SCORE } from '@bellum/contracts'
import type { MatchRunEntity } from '../../../database/entities/match-run.entity'

/**
 * Le document d'explication d'un classement (§13, BEL-MTC-303).
 *
 * Deux propriétés le définissent, et elles sont toutes les deux des exigences,
 * pas des choix de présentation :
 *
 *  - il ne contient AUCUNE donnée d'un autre candidat. C'est ce qui permet de le
 *    remettre à la personne concernée sans fuite croisée.
 *  - il porte la DATE du calcul et la PONDÉRATION employée. Les poids sont
 *    réglables par espace : une explication qui tairait les siens n'expliquerait
 *    rien, et deviendrait fausse à la première modification.
 *
 * Il ne porte pas non plus le nom de la personne : l'appelant l'a déjà, et le
 * moteur ne l'a jamais eu.
 */
export function toExplanation(run: MatchRunEntity, need: MatchNeed, result: MatchResult): MatchExplanation {
  return {
    runId: run.id,
    runAt: run.created_at.toISOString(),
    role: need.role,
    accountName: need.accountName,
    weights: run.weights as MatchExplanation['weights'],
    threshold: run.threshold,
    consultantId: result.consultantId,
    correspondenceScore: result.correspondenceScore,
    pushableScore: result.pushableScore,
    bucket: result.bucket,
    axes: result.axes,
    exclusions: result.exclusions,
    gaps: result.gaps,
    questionsToValidate: result.questionsToValidate,
  }
}

const AXIS_LABELS: Record<string, string> = {
  must_have: 'Compétences obligatoires',
  nice_to_have: 'Compétences souhaitées',
  seniority: 'Séniorité',
  sector: 'Expérience sectorielle',
  environment: 'Environnement technique',
  language: 'Langue',
  location: 'Localisation et mobilité',
  availability: 'Disponibilité',
  contract_status: 'Statut contractuel',
  rate: 'TJM',
  evidence_quality: 'Qualité de la preuve',
  client_constraints: 'Contraintes client',
  client_history: 'Historique chez ce client',
  // #2176.13
  comparable_experience: 'Expérience comparable (affichée, poids 0)',
}

/**
 * La version remettable du document.
 *
 * Un axe non évaluable s'écrit « non évaluable » et non « 0 » : c'est toute la
 * différence entre « ce point ne vous a pas été reproché » et « vous avez zéro ».
 */
export function explanationMarkdown(explanation: MatchExplanation): string {
  const lines: string[] = []
  lines.push(`# Explication d'un classement`)
  lines.push('')
  lines.push(`Poste : ${explanation.role}${explanation.accountName ? ` — ${explanation.accountName}` : ''}`)
  lines.push(`Calcul du ${explanation.runAt}`)
  lines.push(`Seuil de recommandation : ${explanation.threshold}/100`)
  lines.push('')
  // ⚠️ Un score qu'aucun calcul n'a produit ne s'écrit pas « 0/100 ».
  //
  // Le pré-filtrage écarte AVANT les treize axes et compose un résultat sans
  // aucun axe, avec deux zéros que le contrat impose faute de champ nullable.
  // C'est justement le profil dont l'explication compte le plus : celui à qui
  // l'on doit dire pourquoi il n'a pas été proposé. Lui remettre un document qui
  // annonce « Score de correspondance : 0/100 » lui attribue une note que
  // personne ne lui a donnée — et c'est le motif d'exclusion, plus bas, qui
  // porte la vraie réponse.
  const measured = matchScoreIsMeasured(explanation.axes)
  // #2176.13 — un axe à poids 0 ne compte pas pour « mesuré » (matchScoreIsMeasured).
  const evaluated = explanation.axes.filter(axis => axis.score !== null && !isDisplayOnlyMatchAxis(axis.axis)).length
  const noScore = `non mesuré — ${evaluated} axe(s) évaluable(s), il en faut ${MIN_AXES_FOR_SCORE}`
  lines.push(`Score de correspondance : ${measured ? `${explanation.correspondenceScore}/100` : noScore}`)
  lines.push(`Score de poussabilité : ${measured ? `${explanation.pushableScore}/100` : noScore}`)
  lines.push('')
  lines.push('## Le détail, axe par axe')
  lines.push('')
  lines.push('| Axe | Poids | Score | Détail |')
  lines.push('| --- | --- | --- | --- |')
  for (const axis of explanation.axes) {
    const score = axis.score === null ? 'non évaluable' : `${axis.score}/100`
    lines.push(`| ${AXIS_LABELS[axis.axis] ?? axis.axis} | ${axis.weight} | ${score} | ${axis.detail} |`)
  }
  lines.push('')
  if (explanation.exclusions.length > 0) {
    lines.push('## Les motifs retenus')
    lines.push('')
    for (const exclusion of explanation.exclusions) {
      lines.push(`- ${exclusion.reason} — ${exclusion.detail}`)
    }
    lines.push('')
  }
  if (explanation.gaps.length > 0) {
    lines.push('## Ce qui manquait')
    lines.push('')
    for (const gap of explanation.gaps) lines.push(`- ${gap}`)
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push(
    'Ce classement est produit par un système automatisé. Il propose, une personne décide. ' +
      'Les scores ci-dessus sont calculés à partir des seuls critères du poste : ' +
      "ni l'âge, ni le genre, ni l'origine, ni la nationalité, ni la photographie, ni le nom n'y entrent.",
  )
  return lines.join('\n')
}
