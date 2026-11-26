import type { ProjectStage } from '@bellum/contracts'

/**
 * Théo C projects-fiche.R2 / N3 — LA FRISE D'ÉTAPE : À qualifier › Cadrage › Profils présentés ›
 * Proposition › Gagnée, avec le rang de chaque étape.
 *
 * Les neuf états du pipe ne sont PAS migrés : la frise est une LECTURE de l'état stocké, rien n'est
 * réécrit. `detected`/`potential`/`confirmed` se lisent « À qualifier » ; « Perdue » et « En sommeil »
 * sont des SORTIES (Théo N4 : « Mettre en veille ou clore »), pas des étapes — la frise ne s'allume sur
 * aucune d'elles et la sortie se nomme à côté. Cliquer une étape vise l'état stocké correspondant, par
 * le même déplacement gouverné que le sélecteur (panneau d'effet, jamais une porte de côté).
 */
export const FRIEZE_STEPS = ['to_qualify', 'framing', 'profiles', 'proposal', 'won'] as const
type FriezeStep = (typeof FRIEZE_STEPS)[number]

const STEP_OF_STAGE: Partial<Record<ProjectStage, number>> = {
  detected: 0,
  potential: 0,
  confirmed: 0,
  qualified: 1,
  profiles_submitted: 2,
  negotiation: 3,
  won: 4,
}

const STAGE_OF_STEP: Record<FriezeStep, ProjectStage> = {
  to_qualify: 'confirmed',
  framing: 'qualified',
  profiles: 'profiles_submitted',
  proposal: 'negotiation',
  won: 'won',
}

export function stageOfFriezeStep(step: FriezeStep): ProjectStage {
  return STAGE_OF_STEP[step]
}

type FriezeView = {
  /** `null` sur une sortie : aucune étape n'est « courante ». */
  activeIndex: number | null
  exit: 'lost' | 'dormant' | null
  steps: { key: FriezeStep; rank: number; status: 'done' | 'current' | 'upcoming' }[]
}

export function friezeFor(stage: ProjectStage): FriezeView {
  const activeIndex = STEP_OF_STAGE[stage] ?? null
  return {
    activeIndex,
    exit: stage === 'lost' || stage === 'dormant' ? stage : null,
    steps: FRIEZE_STEPS.map((key, index) => ({
      key,
      rank: index + 1,
      status: activeIndex === null || index > activeIndex ? 'upcoming' : index === activeIndex ? 'current' : 'done',
    })),
  }
}
