import { describe, expect, it } from 'vitest'
import type { ChatResponseContext } from './ContextDisclosure'
import { angleVariant, applyPendingBranch, computeDataOrigin, precedingUserText } from './reply-branch'
import type { BranchableMessage } from './reply-branch'

function context(sources: ChatResponseContext['sources']): ChatResponseContext {
  return {
    active: {
      profile: { present: true, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources,
    not_consulted: [],
  }
}

describe('computeDataOrigin — #1953.21, la réponse dit si elle réutilise ou relance', () => {
  it('rend `null` quand un des deux contextes est absent — non mesuré n’est jamais une valeur', () => {
    expect(computeDataOrigin(undefined, context([]))).toBeNull()
    expect(computeDataOrigin(context([]), undefined)).toBeNull()
    expect(computeDataOrigin(undefined, undefined)).toBeNull()
  })

  it('rend `reused` quand le jeu de sources est EXACTEMENT le même', () => {
    const previous = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' }])
    const next = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' }])
    expect(computeDataOrigin(previous, next)).toBe('reused')
  })

  it('l’ordre des sources ne change rien — c’est un ENSEMBLE, pas une séquence', () => {
    const previous = context([
      { kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' },
      { kind: 'brave', label: 'Recherche web', as_of: '2026-08-02' },
    ])
    const next = context([
      { kind: 'brave', label: 'Recherche web', as_of: '2026-08-02' },
      { kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' },
    ])
    expect(computeDataOrigin(previous, next)).toBe('reused')
  })

  it('rend `refreshed` quand une date de source a changé — une recherche a été relancée', () => {
    const previous = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' }])
    const next = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-09-10' }])
    expect(computeDataOrigin(previous, next)).toBe('refreshed')
  })

  it('rend `refreshed` quand le nombre ou la nature des sources a changé', () => {
    const previous = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' }])
    const next = context([
      { kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' },
      { kind: 'brave', label: 'Recherche web', as_of: '2026-09-10' },
    ])
    expect(computeDataOrigin(previous, next)).toBe('refreshed')
  })

  it('deux réponses sans aucune source restent `reused` — le vrai compte, zéro compris', () => {
    expect(computeDataOrigin(context([]), context([]))).toBe('reused')
  })
})

describe('precedingUserText — retrouver la question qu’une réponse a suivie', () => {
  const messages: BranchableMessage[] = [
    { role: 'user', content: 'Question 1' },
    { role: 'assistant', content: 'Réponse 1' },
    { role: 'user', content: 'Question 2' },
    { role: 'assistant', content: 'Réponse 2' },
  ]

  it('remonte au dernier message utilisateur avant l’index donné', () => {
    expect(precedingUserText(messages, 3)).toBe('Question 2')
    expect(precedingUserText(messages, 1)).toBe('Question 1')
  })

  it('rend `null` quand rien ne précède (ouverture de Laura sans question)', () => {
    expect(precedingUserText([{ role: 'assistant', content: 'Bonjour' }], 0)).toBeNull()
  })
})

describe('angleVariant — #1953.7, demander un autre angle SANS deviner à la place du modèle', () => {
  it('garde la question ORIGINALE, verbatim, et y ajoute la demande — jamais un texte de remplacement', () => {
    const out = angleVariant('Comment aborder ce compte ?', ' (Réponds avec un angle différent.)')
    expect(out).toBe('Comment aborder ce compte ? (Réponds avec un angle différent.)')
    expect(out.startsWith('Comment aborder ce compte ?')).toBe(true)
  })
})

describe('applyPendingBranch — #1953.12/.22, une branche garde sa provenance', () => {
  const previousContext = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-08-01' }])
  const nextContext = context([{ kind: 'pappers', label: 'Fiche Pappers', as_of: '2026-09-16' }])

  it('ne change rien quand aucune branche n’est en attente — l’envoi normal reste inchangé', () => {
    const message: BranchableMessage = { role: 'assistant', content: 'Une réponse' }
    expect(applyPendingBranch(message, null)).toBe(message)
  })

  it('pose `branchOf` et calcule `dataOrigin` à partir des VRAIES sources des deux réponses', () => {
    const message: BranchableMessage = { role: 'assistant', content: 'Une réponse', context: nextContext }
    const previousTimestamp = new Date('2026-09-16T04:12:00.000Z')
    const decorated = applyPendingBranch(message, {
      kind: 'retry',
      previousTimestamp,
      previousContext,
      // #1953.11 — le lien qui part en base ; il ne décore pas la bulle vivante.
      previousMessageId: 'a-1',
    })
    expect(decorated.branchOf).toEqual({ kind: 'retry', previousTimestamp })
    expect(decorated.dataOrigin).toBe('refreshed')
  })
})
