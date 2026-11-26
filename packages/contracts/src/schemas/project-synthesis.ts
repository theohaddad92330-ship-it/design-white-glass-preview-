import { z } from 'zod'

/**
 * #2171.27/.28/.44/.47 (épopée #2951) — LE CONTRAT DE LA SYNTHÈSE IA de la
 * fiche opportunité : sept questions, faits et hypothèses distingués, aucune
 * phrase vague sans fait précis pour la porter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TRANCHE POSE, ET CE QU'ELLE NE POSE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contrat (ce fichier) et sa garde de phrases vagues sont la plus petite
 * tranche prouvable, tranchée sans Louis. La GÉNÉRATION reste HORS de ce lot :
 * ni prompt Claude (`apps/ia`), ni endpoint NestJS, ni onglet web. « Système
 * absent (sections + actions + synthèse IA), plusieurs jours de travail » —
 * voir le commentaire de #2951 sur l'épopée. Construire le contrat AVANT
 * d'écrire un prompt qui le remplirait au hasard suit la même discipline que
 * GA-11/12 (une contrainte se pose avant le code qui écrit dessus).
 */

/** Les SEPT questions du contrat (#2171.27), verbatim de #2171. */
export const projectSynthesisSchema = z.object({
  projectId: z.string().guid(),
  /** Quel problème le client cherche à résoudre. */
  problem: z.string().trim().min(1),
  /** Ce qui est CONFIRMÉ — des faits, jamais une déduction du modèle. */
  confirmed: z.array(z.string().trim().min(1)),
  /** Ce qui est encore SUPPOSÉ — nommé comme hypothèse, jamais confondu avec
   *  `confirmed` (« la synthèse distingue faits et hypothèses », critère de
   *  recette #4 de #2171). */
  hypotheses: z.array(z.string().trim().min(1)),
  /** Qui décide — un rôle du circuit de décision (#2171.19 : sponsor,
   *  décideur, prescripteur…), jamais un pourcentage ni une probabilité
   *  (doctrine `c26_probabilite`). `null` : pas encore identifié. */
  decisionMaker: z.string().trim().min(1).nullable(),
  /** Quelles conditions peuvent bloquer l'affaire. */
  blockingConditions: z.array(z.string().trim().min(1)),
  /** Ce que l'équipe doit obtenir ensuite. */
  nextToObtain: z.string().trim().min(1),
  /** Ce qu'il ne faut PAS faire. */
  whatNotToDo: z.string().trim().min(1),
  generatedAt: z.string(),
})
export type ProjectSynthesis = z.infer<typeof projectSynthesisSchema>

/**
 * Les phrases vagues NOMMÉMENT interdites par #2171.28, verbatim : une
 * synthèse qui les porte SANS fait précis pour les étayer ne tient pas la
 * promesse du contrat.
 */
export const PROJECT_SYNTHESIS_FORBIDDEN_PHRASES = ['Opportunité intéressante', 'Bon potentiel', 'À suivre'] as const

/**
 * `true` quand une phrase vague apparaît SANS qu'aucun fait (confirmé ou
 * hypothèse) ne l'accompagne — la porte que #2171.28 demande. Une synthèse qui
 * écrit « Bon potentiel » ET liste des faits confirmés n'est pas vague, elle
 * est juste mal résumée ; c'est l'ABSENCE de fait qui rend la phrase vide.
 */
export function projectSynthesisHasVaguePhraseWithoutFact(
  synthesis: Pick<ProjectSynthesis, 'problem' | 'nextToObtain' | 'whatNotToDo' | 'confirmed' | 'hypotheses'>,
): boolean {
  const text = `${synthesis.problem} ${synthesis.nextToObtain} ${synthesis.whatNotToDo}`
  const hasVaguePhrase = PROJECT_SYNTHESIS_FORBIDDEN_PHRASES.some(phrase => text.includes(phrase))
  const hasFact = synthesis.confirmed.length > 0 || synthesis.hypotheses.length > 0
  return hasVaguePhrase && !hasFact
}
