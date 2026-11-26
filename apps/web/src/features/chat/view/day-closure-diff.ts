import type { DayClosureDecision, DayClosureTask, UpdateTaskInput } from '@bellum/contracts'

/**
 * #2392.4 / .5 / .9 — CE QUE LA CLÔTURE VA CHANGER, avant que rien ne change.
 *
 * Une décision est prise tâche par tâche sur la carte ; ce module en tire le
 * DIFF (avant → après) et le patch exact que `PATCH /tasks/:id` recevra. Trois
 * règles tenues ici :
 *  - une tâche SANS décision ne produit aucun changement : rien n'est reporté
 *    d'office (le NO-GO de #2392.9) ;
 *  - une décision qui ne change rien (report à aujourd'hui, délégation à soi,
 *    titre identique) n'en produit pas non plus — le diff ne ment pas ;
 *  - « abandonner » archive (`cancelled`), jamais une suppression.
 */
export type TaskDecisionDraft =
  | { kind: 'postpone'; dueOn: string }
  | { kind: 'delegate'; ownerId: string }
  | { kind: 'requalify'; title: string }
  | { kind: 'drop'; reason: string }
  | { kind: 'done'; note: string }

// Garde de compilation : les décisions de la carte sont EXACTEMENT celles du contrat.
type _SameDecisions = TaskDecisionDraft['kind'] extends DayClosureDecision
  ? DayClosureDecision extends TaskDecisionDraft['kind']
    ? true
    : never
  : never
const _decisionsMatch: _SameDecisions = true
void _decisionsMatch

export type DayClosureChange = {
  taskId: string
  title: string
  kind: TaskDecisionDraft['kind']
  /** Ce qui change, lisible : la date, le propriétaire, le titre ou le statut d'avant. */
  before: string | null
  after: string | null
  patch: UpdateTaskInput
}

function changeOf(task: DayClosureTask, decision: TaskDecisionDraft, today: string): DayClosureChange | null {
  const base = { taskId: task.id, title: task.title, kind: decision.kind }
  switch (decision.kind) {
    case 'postpone':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(decision.dueOn) || decision.dueOn <= today) return null
      return { ...base, before: task.dueOn, after: decision.dueOn, patch: { dueOn: decision.dueOn } }
    case 'delegate':
      if (!decision.ownerId || decision.ownerId === task.ownerId) return null
      return { ...base, before: task.ownerId, after: decision.ownerId, patch: { ownerId: decision.ownerId } }
    case 'requalify': {
      const title = decision.title.trim()
      if (!title || title === task.title) return null
      return { ...base, before: task.title, after: title, patch: { title } }
    }
    case 'drop': {
      const reason = decision.reason.trim()
      return {
        ...base,
        before: null,
        after: reason || null,
        patch: reason ? { status: 'cancelled', resultNote: reason } : { status: 'cancelled' },
      }
    }
    case 'done': {
      const note = decision.note.trim()
      return {
        ...base,
        before: null,
        after: note || null,
        patch: note ? { status: 'done', resultNote: note } : { status: 'done' },
      }
    }
  }
}

export function dayClosureChanges(
  tasks: readonly DayClosureTask[],
  decisions: Readonly<Record<string, TaskDecisionDraft>>,
  today: string,
): DayClosureChange[] {
  return tasks.flatMap(task => {
    const decision = decisions[task.id]
    if (!decision) return []
    const change = changeOf(task, decision, today)
    return change ? [change] : []
  })
}
