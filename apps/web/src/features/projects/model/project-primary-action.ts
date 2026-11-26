import type { ProjectStage, WorkspaceProfile } from '@bellum/contracts'
import { asStage } from './project-index'

/**
 * #2171.16 — L'ACTION PRINCIPALE DYNAMIQUE.
 *
 * L'épopée décrit SEPT libellés sur un cycle conceptuel (« à qualifier »,
 * « besoin confirmé sans profil », « profils recherchés », « profils
 * présentés », « entretien », « négociation », « signé »). Le modèle RÉEL
 * (`PROJECT_STAGES`) en porte NEUF, et ne distingue ni « profils recherchés »
 * (le matching une fois lancé n'a pas d'état propre avant `profiles_submitted`)
 * ni un stade « entretien » (c'est un DÉRIVÉ des positionnements,
 * `interview_count`, jamais une étape du projet) — les inventer créerait un
 * état que rien en base ne peut jamais confirmer, ce que la doctrine refuse
 * (« aucune donnée fictive »).
 *
 * Le mapping choisit donc : les trois premières étapes réelles (`detected`,
 * `potential`, `qualified`) partagent UN SEUL libellé — aucune n'a d'action
 * distincte dans le modèle produit — et `profiles_submitted` distingue
 * « préparer l'entretien » de « suivre les retours » sur le SIGNAL réel
 * (`interview_count`), pas sur une étape inventée. `won` garde son bouton
 * dédié déjà là (`openMission`/`createMission`, #1327) : lui ajouter une
 * seconde action « principale » ferait deux boutons pour un seul geste.
 * `lost`/`dormant` n'ont rien à pousser en avant : aucune action, jamais un
 * libellé qui ne mène nulle part.
 */
type ProjectPrimaryActionKey =
  | 'qualify'
  | 'launchMatching'
  | 'frameProject'
  | 'followUp'
  | 'prepareInterview'
  | 'secureAgreements'

type ProjectPrimaryAction = {
  labelKey: ProjectPrimaryActionKey
  /** `data-anchor` de la section vers laquelle l'action fait défiler l'écran. */
  anchor: 'project-commercial-conditions' | 'project-needs-panel' | 'project-submissions-panel' | 'project-framing'
}

const STAGE_ACTIONS: Partial<Record<ProjectStage, ProjectPrimaryAction>> = {
  detected: { labelKey: 'qualify', anchor: 'project-commercial-conditions' },
  potential: { labelKey: 'qualify', anchor: 'project-commercial-conditions' },
  qualified: { labelKey: 'qualify', anchor: 'project-commercial-conditions' },
  confirmed: { labelKey: 'launchMatching', anchor: 'project-needs-panel' },
  negotiation: { labelKey: 'secureAgreements', anchor: 'project-commercial-conditions' },
}

export function primaryActionForProject(
  project: {
    stage: string
    interview_count?: number
  },
  /** #4291.7 (recette 23/10) — le profil d'espace : en `forfait_conseil` une demande confirmée est un projet À CADRER. */
  profile: WorkspaceProfile | null = null,
): ProjectPrimaryAction | null {
  const stage = asStage(project.stage)
  if (!stage) return null

  // #4291.7 — en espace forfait / conseil, rien n'est à staffer : l'action principale d'une demande confirmée est de
  // CADRER le projet (périmètre, sponsor, budget), pas de lancer un matching. Les autres étapes restent celles du pipe.
  if (profile === 'forfait_conseil' && stage === 'confirmed') {
    return { labelKey: 'frameProject', anchor: 'project-framing' }
  }

  if (stage === 'profiles_submitted') {
    return (project.interview_count ?? 0) > 0
      ? { labelKey: 'prepareInterview', anchor: 'project-submissions-panel' }
      : { labelKey: 'followUp', anchor: 'project-submissions-panel' }
  }

  return STAGE_ACTIONS[stage] ?? null
}
