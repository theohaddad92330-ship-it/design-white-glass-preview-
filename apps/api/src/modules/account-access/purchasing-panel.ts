import type { AccessAnswerValue } from '@bellum/contracts'

/** Ce qu'on écrit dans le fait, en clair : la réponse brute ne se lit pas. */
export const ANSWER_DETAIL: Partial<Record<AccessAnswerValue, string>> = {
  panel_ferme: 'le compte a indiqué passer par un panel fermé',
  panel_ouvert: 'le compte a indiqué ne pas imposer de référencement',
  refus_referencement: 'refus motivé par l’absence de référencement',
}

type PurchasingPanel = 'panel_ferme' | 'panel_ouvert' | 'refus_referencement'

const PANEL_ANSWERS: readonly PurchasingPanel[] = ['panel_ferme', 'panel_ouvert', 'refus_referencement']

/**
 * #3278.2 — le FAIT panel/référencement d'un compte, relu depuis le fait de
 * verrou que `recordAnswer` a écrit (il en garde la réponse dans `detail`).
 * `null` quand le verrou n'a pas cette origine : un verrou déduit ou saisi
 * librement ne dit rien du processus d'achat, on ne le devine pas.
 */
export function purchasingPanelOf(fact: { source: string; detail?: string | null } | null): PurchasingPanel | null {
  if (!fact || fact.source !== 'human' || !fact.detail) return null
  return PANEL_ANSWERS.find(answer => ANSWER_DETAIL[answer] === fact.detail) ?? null
}
