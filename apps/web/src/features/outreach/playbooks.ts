import {
  buildPlaybookCreateRequest,
  type CreateOutreachSequenceRequest,
  type OutreachPlaybookKey,
  type PlaybookStepDraft,
  type PlaybookStepDrafts,
} from '@bellum/contracts'

/**
 * Lot L-C (#4166) — LES MODÈLES, côté écran : la requête de création et le
 * contexte donné à Laura. Pur, testé hors composant.
 *
 * ⚠️ Rien n'est inventé : un texte que Laura n'a pas pu préparer reste VIDE
 * (l'étape se fait à la main), et une variable vide bloque l'étape au lieu de
 * laisser un `{{prenom}}` littéral dans un message.
 */

export type StepDraft = PlaybookStepDraft

/** Le texte de chaque étape, par rang (0-based) — ce que l'utilisateur a relu. */
export type PlaybookDrafts = PlaybookStepDrafts

/** Le constructeur est PARTAGÉ avec les automatisations (L-D1) : il vit dans `@bellum/contracts`. */
export function buildPlaybookRequest(input: {
  contactId: string
  playbook: OutreachPlaybookKey
  name: string
  drafts: PlaybookDrafts
  /** Geste explicite pour passer outre une exclusion FORÇABLE (jamais le RGPD). */
  overrideExclusions?: { justification: string }
}): CreateOutreachSequenceRequest {
  return buildPlaybookCreateRequest(input)
}

/** Le contexte donné à Laura est PARTAGÉ avec les automatisations (L-D1) : il vit dans `@bellum/contracts`. */
export { buildPlaybookContext } from '@bellum/contracts'

/** Les termes dont la présence dans un message vaut « personnalisé » : prénom, nom, compte. */
export function personalizationTerms(contact: { full_name: string; account_name?: string | null }): string[] {
  const terms = [...contact.full_name.split(/\s+/), contact.account_name ?? '']
    .map(term => term.trim())
    .filter(term => term.length > 0)
  return [...new Set(terms)]
}
