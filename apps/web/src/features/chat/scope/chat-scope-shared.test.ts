import { describe, expect, it } from 'vitest'
import { PORTFOLIO_SCOPE, SHARED_SCOPE, isSameScope, isSharedScope, scopeAccountId, scopeObjectOf } from './chat-scope'
import { sharedThreads } from '@/features/chat/lib/shared-conversation'

/**
 * #1910.8 — « une conversation partagée » est un périmètre de LECTURE HUMAINE.
 *
 * Arbitré par Louis le 16/09/2026 : un filtre pour RETROUVER ses fils partagés,
 * que l'humain lit et que Laura NE lit PAS. La garde tient les deux moitiés —
 * le filtre EXISTE, et rien de ce périmètre ne descend vers le modèle (D65).
 */
describe('#1910.8 — le périmètre « conversation partagée »', () => {
  it('existe comme portée, et se compare à elle-même', () => {
    expect(SHARED_SCOPE.kind).toBe('shared')
    expect(isSharedScope(SHARED_SCOPE)).toBe(true)
    expect(isSharedScope(PORTFOLIO_SCOPE)).toBe(false)
    expect(isSameScope(SHARED_SCOPE, SHARED_SCOPE)).toBe(true)
    expect(isSameScope(SHARED_SCOPE, PORTFOLIO_SCOPE)).toBe(false)
  })

  it('n’envoie RIEN au modèle : ni compte, ni objet — D65 tient', () => {
    expect(scopeAccountId(SHARED_SCOPE)).toBeNull()
    expect(scopeObjectOf(SHARED_SCOPE)).toBeNull()
  })
})

describe('#1910.8 — retrouver ses fils partagés', () => {
  const me = { firstName: 'Sarah', avatarUrl: null }
  const mine = {
    id: 't1',
    account_id: null,
    conversation_id: 'c1',
    title: 'Mon fil',
    created_at: '2026-09-10T08:00:00Z',
    author: me,
  }
  const hers = {
    id: 't2',
    account_id: null,
    conversation_id: 'c2',
    title: 'Le fil de Karim',
    created_at: '2026-09-11T08:00:00Z',
    author: { firstName: 'Karim', avatarUrl: null },
  }
  // Auteur non résolu par le serveur (compte effacé, message antérieur au champ).
  const anonymous = {
    id: 't3',
    account_id: null,
    conversation_id: 'c3',
    title: 'Sans auteur',
    created_at: '2026-09-12T08:00:00Z',
    author: null,
  }

  it('garde les fils ouverts par quelqu’un d’AUTRE, dans l’ordre servi', () => {
    expect(sharedThreads([mine, hers, anonymous], me).map(thread => thread.id)).toEqual(['t2'])
  })

  it('sans mon prénom, ne montre RIEN plutôt que de nommer un collègue à tort', () => {
    expect(sharedThreads([mine, hers], null)).toEqual([])
    expect(sharedThreads([mine, hers], { firstName: '  ', avatarUrl: null })).toEqual([])
  })

  it('un fil sans auteur lisible n’est jamais déclaré partagé', () => {
    expect(sharedThreads([anonymous], me)).toEqual([])
  })
})
