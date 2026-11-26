import type { ProjectStage, Submission } from '@bellum/contracts'
import { presentationState } from '@/features/submissions/lib/presentationStates'

type NextInformation =
  | { kind: 'prepareMission' }
  | { kind: 'openMission' }
  | { kind: 'clientFeedback'; name: string | null }
  | { kind: 'primaryAction' }

/**
 * Théo C projects-fiche.R3 — UN SEUL bandeau « prochaine information utile » à la place de la liste
 * « Actions et prochaines étapes » : une affaire gagnée prépare sa mission (A1 — « Créer la mission » ne
 * s'offre qu'une fois gagnée), une présentation consignée sans retour attend le retour du client, sinon
 * l'action principale de l'étape (`primaryActionForProject`, une seule fonction — GA-26). Une sortie (perdue,
 * en sommeil) ne pousse rien. Dérivé de ce qui est déjà lu : aucune valeur nouvelle.
 */
export function nextInformation(
  project: { stage: ProjectStage; hasMission: boolean },
  submissions: readonly Submission[],
): NextInformation | null {
  if (project.stage === 'lost' || project.stage === 'dormant') return null
  if (project.stage === 'won') return project.hasMission ? { kind: 'openMission' } : { kind: 'prepareMission' }
  const waiting = submissions.find(item => presentationState(item) === 'presented' && item.firstFeedbackAt === null)
  if (waiting) return { kind: 'clientFeedback', name: waiting.consultantName }
  return { kind: 'primaryAction' }
}
