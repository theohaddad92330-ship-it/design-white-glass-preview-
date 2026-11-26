/**
 * #2328.25 (épopée #2793) — LA PREUVE NOMMÉE d'une compétence, pour
 * l'explication d'un classement.
 *
 * `axes.ts`/`explanation.ts` savent déjà CITER `MatchSkill.proof` dans le
 * détail d'un axe et dans `evidence[].label` — mais `MatchingService.loadCandidates`
 * posait `proof: null` sur CHAQUE compétence, quelle que soit sa source : « du
 * code juste, calculé, testé, que personne n'appelle » (CLAUDE.md). Cette
 * fonction construit ENFIN cette citation, à partir des preuves posées sur
 * `consultant_skills` (#2793 : expérience source, projet, certification,
 * niveau validé, retour client).
 *
 * Priorité : l'expérience NOMMÉE (projet puis client) d'abord — c'est la
 * preuve la plus forte, la seule qui dise QUOI et OÙ. Le reste ne fait que
 * dire QU'UN humain a regardé.
 */
export type SkillProofInput = {
  /** `true` seulement quand `consultant_skills.source_experience_id` pointe
   *  vers une ligne `consultant_experiences` qui existe encore. */
  experienceLinked: boolean
  sourceProject: string | null
  experienceEntreprise: string | null
  experienceRole: string | null
  experienceClientMasked: boolean
  certification: boolean
  validatedLevel: string | null
  clientFeedback: string | null
}

/** Au-delà, la citation devient un extrait, pas une preuve courte. */
const CLIENT_FEEDBACK_PROOF_MAX = 80

function experienceProof(input: SkillProofInput): string | null {
  if (!input.experienceLinked) return null
  const who = input.experienceClientMasked ? 'client masqué' : input.experienceEntreprise
  if (input.sourceProject) {
    if (who) return `projet « ${input.sourceProject} » chez ${who}`
    if (input.experienceRole) return `projet « ${input.sourceProject} » — ${input.experienceRole}`
    return `projet « ${input.sourceProject} »`
  }
  if (who) return input.experienceRole ? `mission chez ${who} — ${input.experienceRole}` : `mission chez ${who}`
  if (input.experienceRole) return `mission — ${input.experienceRole}`
  // Lié, mais rien de nommable dans l'expérience elle-même (rare) : le lien
  // existe, on le dit, plutôt que de retomber sur une preuve plus faible.
  return 'expérience source citée'
}

export function buildSkillProof(input: SkillProofInput): string | null {
  const fromExperience = experienceProof(input)
  if (fromExperience) return fromExperience
  if (input.certification) return 'certification'
  if (input.validatedLevel) return 'niveau validé'
  if (input.clientFeedback) {
    const feedback = input.clientFeedback.trim()
    const truncated =
      feedback.length > CLIENT_FEEDBACK_PROOF_MAX ? `${feedback.slice(0, CLIENT_FEEDBACK_PROOF_MAX)}…` : feedback
    return truncated ? `retour client : « ${truncated} »` : null
  }
  return null
}
