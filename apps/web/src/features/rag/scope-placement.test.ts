import { describe, expect, it } from 'vitest'
import { attachScopesFor, ragScopePlacement } from './scope-placement'

const ACCOUNT = '0000000a-0000-4000-8000-00000000000a'

describe('ragScopePlacement — #2779, la portée voyage avec SA cible', () => {
  it('`conversation` porte le fil', () => {
    expect(ragScopePlacement('conversation', { conversationId: 'fil', accountId: ACCOUNT })).toEqual({
      scope: 'conversation',
      conversationId: 'fil',
    })
  })

  it('`account` porte le compte, jamais le fil', () => {
    expect(ragScopePlacement('account', { conversationId: 'fil', accountId: ACCOUNT })).toEqual({
      scope: 'account',
      accountId: ACCOUNT,
    })
  })

  it.each(['workspace', 'personal', 'knowledge_base'] as const)('`%s` ne porte aucune cible', scope => {
    expect(ragScopePlacement(scope, { conversationId: 'fil', accountId: ACCOUNT })).toEqual({ scope })
  })
})

describe('attachScopesFor — les portées proposées à l’ajout', () => {
  it('propose les cinq portées quand le fil porte un compte, le fil d’abord', () => {
    expect(attachScopesFor(ACCOUNT)).toEqual(['conversation', 'personal', 'workspace', 'account', 'knowledge_base'])
  })

  it('NON : sans compte, « Un compte précis » n’est pas proposé', () => {
    expect(attachScopesFor(null)).not.toContain('account')
  })
})
