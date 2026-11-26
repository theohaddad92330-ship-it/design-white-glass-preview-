import { isAnswerFilled, TEMPS1_REQUIRED_KEYS, type EsnAnswers } from '@bellum/contracts'

/** Au-delà, le bloc compact devient un mur qu'on ne lit plus. */
const MAX_ITEMS = 3

function top(values: readonly string[] | null | undefined): string[] {
  return (values ?? [])
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
}

/** Ce que « Ce que Bellum va chercher pour toi » (#1584) affiche — quatre
 *  facettes du PROFIL ESN RÉEL, jamais inventées. Vide quand le champ
 *  correspondant n'a pas été renseigné : une liste vide se rend simplement en
 *  moins de lignes, jamais un texte de remplissage. */
export type EsnFocusSummary = {
  expertise: string[]
  territory: string[]
  accountTypes: string[]
  priority: string[]
}

export function summarizeEsnFocus(answers: EsnAnswers | null | undefined): EsnFocusSummary {
  return {
    expertise: top(answers?.expertise_areas),
    territory: top(answers?.geo_zones),
    accountTypes: top(answers?.target_company_types),
    // « Priorité » = les secteurs cibles déclarés par l'ESN — la facette la
    // plus proche de « ce qui compte le plus pour toi » parmi les réponses de
    // Temps 1.
    priority: top(answers?.target_sectors),
  }
}

/**
 * Le profil ESN est-il INCOMPLET (#1584) — à signaler AVANT le débit, jamais
 * après. Même porte que le reste du produit : `TEMPS1_REQUIRED_KEYS` est la
 * grille de complétion que le serveur applique déjà à l'onboarding
 * (`GET /onboarding/state`) — une seconde règle de complétude ici finirait
 * par diverger de celle-là.
 */
export function isEsnProfileIncomplete(answers: EsnAnswers | null | undefined): boolean {
  if (!answers) return true
  return TEMPS1_REQUIRED_KEYS.some(key => !isAnswerFilled(answers[key] as string | string[] | null))
}
