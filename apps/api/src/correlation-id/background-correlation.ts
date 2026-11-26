import { randomUUID } from 'node:crypto'
import { correlationStorage, type CorrelationContext } from './correlation-id.store'

/**
 * Le fil de corrélation pour ce qui ne vient PAS d'une requête HTTP : jobs BullMQ
 * et tâches planifiées.
 *
 * Le middleware Express ouvre un contexte par requête, et le logger Winston y
 * ajoute `correlation_id` sur chaque ligne. Hors requête, ce contexte n'existe
 * pas : les logs d'un worker ou d'un cron sortaient donc SANS fil — or ce sont
 * exactement ceux qu'on lit en incident, parce que c'est là que tournent les
 * traitements longs (analyse, enrichissement, veille, envois).
 *
 * `runInBackgroundCorrelation` ouvre un contexte pour la durée de l'exécution.
 * Il réutilise l'identifiant transporté par le job quand il y en a un — c'est ce
 * qui permet de suivre une action de bout en bout, du clic de l'utilisateur
 * jusqu'au job qu'il a déclenché — et en génère un sinon.
 */
export function runInBackgroundCorrelation<T>(label: string, fn: () => T, inheritedId?: string | null): T {
  const context: CorrelationContext = {
    correlationId: inheritedId?.trim() || randomUUID(),
    // `requestPath` est ce que la supervision affiche : lui donner le nom de la
    // tâche évite d'avoir un identifiant sans savoir de quoi il parle.
    requestPath: label,
    requestMethod: 'JOB',
  }
  return correlationStorage.run(context, fn)
}

/**
 * Décorateur de méthode : ouvre un contexte de corrélation pour tout l'appel.
 *
 * Posé SOUS `@Cron(...)` (les décorateurs s'appliquent de bas en haut, donc le
 * planificateur enregistre bien la version enveloppée) :
 *
 * ```ts
 * @Cron('0 5 * * *')
 * @Correlated('watchlist-refresh')
 * async sweep() { … }
 * ```
 *
 * Rien d'autre n'est modifié : la valeur de retour et les erreurs traversent
 * telles quelles. Une tâche ne doit jamais échouer à cause de sa journalisation.
 */
export function Correlated(label?: string): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown
    if (typeof original !== 'function') return descriptor
    const name = label ?? `${target.constructor?.name ?? 'job'}.${String(propertyKey)}`
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      return runInBackgroundCorrelation(name, () => original.apply(this, args))
    }
    return descriptor
  }
}
