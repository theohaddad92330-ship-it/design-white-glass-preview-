import type { BriefingAction, Task } from '@bellum/contracts'

/**
 * #2105.24/.25 — LE LIBELLÉ D'UNE CARTE, calculé UNE fois (GA-26).
 *
 * `PriorityCard` en avait déjà besoin pour son propre affichage ; le transfert
 * vers une tâche (#2105.24) et la garde de dédup (#2105.53) en ont besoin de
 * la MÊME valeur — recalculer la même règle à un second endroit finirait par
 * diverger le jour où l'un des deux oublie une mise à jour.
 */
export function briefingActionHeadline(
  action: Pick<BriefingAction, 'fact' | 'labelKey' | 'labelVars'>,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const strip = (key: string) => key.replace(/^briefing\./, '')
  return action.fact?.labelKey
    ? t(strip(action.fact.labelKey), action.fact.labelVars)
    : t(strip(action.labelKey), action.labelVars)
}

/**
 * #2105.25 — CE QUE LA TÂCHE TRANSFORMÉE DOIT RATTACHER.
 *
 * Seuls compte et contact ont un équivalent direct côté `Task`
 * (`accountId`/`contactId`) : une mission ou un talent n'en ont aucun
 * (`Task.projectId` référence `opportunities`, pas `missions` — les
 * rattacher créerait une tâche orpheline que `assertTargets` refuserait, ou
 * pire, l'attacherait au mauvais dossier). Sans objet ouvrable, la tâche
 * transformée reste PERSONNELLE plutôt que mal rattachée.
 */
export function briefingActionTaskTarget(action: Pick<BriefingAction, 'businessObject'>): {
  accountId?: string
  contactId?: string
} {
  if (action.businessObject?.kind === 'account') return { accountId: action.businessObject.id }
  if (action.businessObject?.kind === 'contact') return { contactId: action.businessObject.id }
  return {}
}

/**
 * #2105.53 — LA GARDE DE DÉDUP : une carte déjà transformée en tâche ne se
 * repropose pas.
 *
 * Le rapprochement porte sur ce que la tâche PORTE réellement — le même
 * intitulé exact (celui que `briefingActionHeadline` écrit dans le composeur,
 * verbatim) et le même objet (compte OU contact) — jamais sur l'id de
 * l'action : une carte du brief est RECALCULÉE chaque matin, elle n'a pas
 * d'identité stable en base à comparer.
 *
 * Une tâche FAITE ou ANNULÉE ne compte pas : rien n'empêche de retransformer
 * un sujet qu'on a déjà traité et refermé, ce n'est plus un doublon actif.
 */
export function briefingActionHasOpenTask(headline: string, linkedId: string | null, tasks: readonly Task[]): boolean {
  return tasks.some(t => {
    if (t.status !== 'todo') return false
    if (t.title !== headline) return false
    return linkedId === null
      ? t.accountId === null && t.contactId === null
      : t.accountId === linkedId || t.contactId === linkedId
  })
}
