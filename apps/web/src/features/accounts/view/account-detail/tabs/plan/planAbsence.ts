import type { Account } from '@bellum/contracts'
import { accountAnalysisAbsence, type AccountAnalysisAbsence } from '../../helpers/analysisAbsence'

/**
 * Pourquoi le plan d'action est vide — quatre réponses, jamais une seule.
 *
 * ## Le défaut que ça corrige
 *
 * Le tableau du plan n'avait qu'un état vide, et sa copie était « Aucune action
 * dans le plan — crée une première action concrète ». Elle est juste quand
 * l'analyse a bien tourné et que le plan ne porte rien. Elle est FAUSSE, et
 * accusatrice, quand la phase 4 n'a pas pu rendre son plan : le produit demande
 * alors à l'utilisateur d'écrire ce que le moteur n'a pas su produire.
 *
 * Ce n'est pas un cas de bord. Mesuré en production sur 30 jours (Railway,
 * `bellum-ia-service`) : **8 `PHASE_TIMEOUT` sur `phase=plan`**, budget 260 s,
 * répartis sur tout le mois — plus la famille des runs interrompus avant la fin.
 * Le journal du moteur écrit « Le dossier est incomplet », et l'écran écrivait
 * « crée une première action ». Deux phrases contradictoires sur le même fait.
 *
 * C'est le motif « cassé et non mesurable se ressemblent » : un dossier sans
 * plan parce que le calcul a échoué et un dossier sans plan parce qu'il n'y
 * avait rien à dire mènent à deux gestes opposés — relancer, ou écrire.
 *
 * #2502.2 — CETTE fonction n'est plus l'implémentation : c'est un ALIAS de
 * `accountAnalysisAbsence` (`helpers/analysisAbsence.ts`), la même
 * classification généralisée à toute section dérivée de l'analyse (elle sert
 * aussi `EmptyEvaluationCard`). Une seule implémentation, GA-26 — ce fichier ne
 * fait plus que renommer `'analysis-complete'` en `'no-actions'`, le nom que
 * ses appelants et ses tests connaissent déjà.
 */
export type PlanAbsence =
  /** L'analyse tourne — le plan arrive, il n'y a rien à faire. */
  | 'analysis-running'
  /** La dernière analyse ne s'est pas terminée : échec ou annulation. */
  | 'analysis-incomplete'
  /** Ce dossier n'a jamais été analysé. */
  | 'not-analyzed'
  /** L'analyse a abouti et le plan ne porte réellement aucune action. */
  | 'no-actions'

const PLAN_ABSENCE_LABEL: Readonly<Record<AccountAnalysisAbsence, PlanAbsence>> = {
  'analysis-running': 'analysis-running',
  'analysis-incomplete': 'analysis-incomplete',
  'not-analyzed': 'not-analyzed',
  'analysis-complete': 'no-actions',
}

/** Les champs du compte dont la réponse dépend — et rien d'autre, pour que la
 *  fonction reste testable sans fabriquer un `Account` entier. */
type PlanAbsenceInput = Pick<Account, 'status'> & Partial<Pick<Account, 'last_analyzed_at'>>

export function planAbsence(input: PlanAbsenceInput): PlanAbsence {
  return PLAN_ABSENCE_LABEL[accountAnalysisAbsence(input)]
}
