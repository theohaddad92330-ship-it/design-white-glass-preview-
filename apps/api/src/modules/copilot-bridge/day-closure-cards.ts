import type { CopilotCardState, DayClosure } from '@bellum/contracts'

/**
 * #2392.3 — section 6 de la clôture de journée, « données à valider » : les
 * cartes de Laura qui attendent encore un clic (writebacks, notes, contacts,
 * réglages). Les MÊMES que l'écran Actions (`GET /action-os/cards`), lues par
 * `CopilotCardService.list` — jamais une seconde liste (GA-26).
 *
 * Le libellé vient de la prévisualisation déjà calculée (« Ce qui va être
 * fait » + objet), jamais d'un texte recomposé ici. Une carte sans
 * prévisualisation (`suggested`) n'est pas « à valider » : rien n'est prêt.
 */
export const DAY_CLOSURE_CARD_STATES: readonly CopilotCardState[] = ['prepared', 'awaiting_review']

/** Au-delà, la liste renvoie à l'écran Actions — la clôture se lit en deux minutes. */
const DAY_CLOSURE_CARDS_MAX = 10

type ReadableCard = {
  id: string
  state: CopilotCardState
  preview: { whatWillHappen: string; targetObject: string | null } | null
}

export function dayClosureCardsToValidate(cards: readonly ReadableCard[] | null): DayClosure['toValidate'] {
  if (cards === null) {
    return { state: 'unavailable', reason: 'Les cartes à valider n’ont pas pu être lues.', cards: [] }
  }
  const lines = cards
    .filter(card => DAY_CLOSURE_CARD_STATES.includes(card.state) && card.preview)
    .slice(0, DAY_CLOSURE_CARDS_MAX)
    .map(card => {
      const what = card.preview?.whatWillHappen.trim() ?? ''
      const target = card.preview?.targetObject?.trim()
      return { id: card.id, label: target ? `${what} — ${target}` : what }
    })
    .filter(line => line.label.length > 0)
  return { state: 'ready', reason: null, cards: lines }
}
