type DecisionKey = 'scope' | 'budget' | 'decider'
export type DecisionState = 'open' | 'partial' | 'done'

type DecisionItem = {
  key: DecisionKey
  state: DecisionState
  /** Le nom de la personne quand l'accès au décideur est fermé. */
  who?: string
  /** « Calculer la marge » : l'économie de la mission se saisit depuis ce point (le calcul demande ses entrées, il n'en invente aucune). */
  canComputeMargin?: boolean
}

type DecisionInput = {
  /** Un brief (périmètre) est enregistré sur l'affaire ou son besoin. */
  hasBrief: boolean
  /** Une cible tarifaire existe — elle ne vaut pas accord client. */
  hasTargetBudget: boolean
  contacts: readonly { role: string; name: string }[]
}

/**
 * Théo C projects-fiche.N1/N2 — « CE QUI RESTE À DÉCIDER » : périmètre, budget et conditions, accès au
 * décideur. Chaque point porte un état en une phrase ; un état se DÉRIVE d'une donnée présente, jamais d'une
 * impression. « Une cible existe ; elle ne vaut pas accord client » : la cible tarifaire ne ferme donc jamais
 * le budget. Le pouvoir de décision se qualifie par le rôle du contact SUR CETTE AFFAIRE
 * (`PROJECT_CONTACT_ROLES`), pas par une note libre.
 */
export function decisionChecklist(input: DecisionInput): DecisionItem[] {
  const decider = input.contacts.find(contact => contact.role === 'decideur')
  return [
    { key: 'scope', state: input.hasBrief ? 'done' : 'open' },
    {
      key: 'budget',
      state: input.hasTargetBudget ? 'partial' : 'open',
      canComputeMargin: true,
    },
    decider
      ? { key: 'decider', state: 'done', who: decider.name }
      : { key: 'decider', state: input.contacts.length > 0 ? 'partial' : 'open' },
  ]
}
