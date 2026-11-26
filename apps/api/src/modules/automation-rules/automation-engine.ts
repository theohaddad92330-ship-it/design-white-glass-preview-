import { automationCreditVerdict, type AutomationOutcome, type OutreachEnrollmentExclusion } from '@bellum/contracts'

/**
 * Lot L-D1 (#4167) — le cœur de la préparation du matin, PUR.
 *
 * Il décide, pour les signaux d'UNE règle : lesquels deviennent une action,
 * lesquels sont écartés et POURQUOI. Il ne lit rien et n'écrit rien : le
 * service lui donne les signaux, l'éligibilité de chaque contact
 * (`OutreachCadenceService.eligibility`, la même que l'inscription manuelle) et
 * ce que la règle a déjà dépensé ; il rend un plan que le service exécute.
 *
 * Trois refus, aucun forçable : une automatisation ne passe JAMAIS outre une
 * exclusion (déjà en séquence active, contacté il y a moins de 30 jours,
 * opposition RGPD, compte client). Le forçage est un geste humain explicite ;
 * ici il n'existe pas.
 */

export type SignalCandidate = {
  /** L'identité du signal POUR cette règle : un même signal ne déclenche jamais deux fois. */
  signalRef: string
  accountId: string | null
  /** Le contact visé (mono-contact, c74), `null` quand aucun n'a pu être résolu — jamais deviné. */
  contactId: string | null
  /** Le « pourquoi maintenant » : ce que le signal dit, tel que sa source l'a écrit. */
  evidence: string
  occurredAt: Date
}

export type RunStep =
  | { type: 'act'; candidate: SignalCandidate; cost: number }
  | {
      type: 'record'
      candidate: SignalCandidate
      outcome: Extract<AutomationOutcome, 'excluded' | 'no_contact' | 'cap_reached'>
      reason: string
    }

export function planRuleRun(input: {
  candidates: readonly SignalCandidate[]
  /** Les signaux dont l'issue est déjà définitive pour cette règle. */
  knownRefs: ReadonlySet<string>
  /** Les exclusions de chaque contact POSSÉDÉ par le porteur ; un contact absent n'est pas à lui. */
  exclusionsByContact: ReadonlyMap<string, readonly OutreachEnrollmentExclusion[]>
  creditCap: number | null
  /** Ce que la règle a déjà dépensé sur 30 jours. */
  creditsSpent: number
  /** Le coût d'une préparation, issu de la grille de crédits. */
  cost: number
  maxPerRun: number
}): RunStep[] {
  const steps: RunStep[] = []
  const handledContacts = new Set<string>()
  let spent = input.creditsSpent
  let acted = 0

  const fresh = input.candidates
    .filter(candidate => !input.knownRefs.has(candidate.signalRef))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

  for (const candidate of fresh) {
    if (acted >= input.maxPerRun) break

    const { contactId } = candidate
    if (!contactId || !input.exclusionsByContact.has(contactId)) {
      steps.push({
        type: 'record',
        candidate,
        outcome: 'no_contact',
        reason: 'Aucun contact à toi n’a pu être retenu pour ce signal.',
      })
      continue
    }

    // Mono-contact : un contact déjà pris dans ce passage est « en séquence » pour le suivant.
    if (handledContacts.has(contactId)) {
      steps.push({ type: 'record', candidate, outcome: 'excluded', reason: 'active_sequence' })
      continue
    }

    const exclusions = input.exclusionsByContact.get(contactId) ?? []
    if (exclusions.length > 0) {
      steps.push({
        type: 'record',
        candidate,
        outcome: 'excluded',
        reason: exclusions.map(exclusion => exclusion.code).join(', '),
      })
      continue
    }

    if (automationCreditVerdict({ cap: input.creditCap, spent, cost: input.cost }) === 'cap_reached') {
      steps.push({
        type: 'record',
        candidate,
        outcome: 'cap_reached',
        reason: 'Le plafond de crédits de la règle est atteint.',
      })
      continue
    }

    spent += input.cost
    acted += 1
    handledContacts.add(contactId)
    steps.push({ type: 'act', candidate, cost: input.cost })
  }
  return steps
}
