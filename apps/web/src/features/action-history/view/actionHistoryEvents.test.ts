import { describe, expect, it } from 'vitest'
import type { ActionHistoryItem } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { actionDetail, actionLabel, statusVariant } from './actionHistoryPresentation'

const t = i18n.getFixedT(null, 'actions') as unknown as Parameters<typeof actionLabel>[0]

function item(overrides: Partial<ActionHistoryItem>): ActionHistoryItem {
  return {
    id: 'a1',
    action_type: 'message_sent',
    category: 'message',
    action_label: 'Message envoyé',
    detail: 'Email',
    channel: null,
    actor: { id: 'u1', name: 'Théo', initials: 'T' },
    target: { account_id: null, contact_id: null, label: 'Decathlon', initials: 'D' },
    created_at: '2026-07-23T08:00:00.000Z',
    rollback: null,
    crmTaskClosable: false,
    ...overrides,
  }
}

/**
 * §8 « Historique » : l'historique ne traçait jamais un changement de score ni
 * de profil. Ces deux événements système se rendent maintenant, avec un libellé
 * LOCALISÉ (FR+EN) et un badge qui dit le sens du mouvement.
 */
describe('journal §8 — score et profil se rendent avec un libellé i18n', () => {
  it('localise le libellé d’un changement de score (pas le libellé serveur brut)', () => {
    const label = actionLabel(t, item({ action_type: 'account_score_changed', action_label: 'Score mis à jour' }))
    expect(label).toBe('Score mis à jour')
  })

  it('garde le détail serveur « 6 → 8 » du score (numérique = neutre)', () => {
    const detail = actionDetail(t, item({ action_type: 'account_score_changed', detail: '6 → 8' }))
    expect(detail).toBe('6 → 8')
  })

  it('localise libellé ET détail d’une mise à jour de profil', () => {
    const it2 = item({
      action_type: 'profile_updated',
      action_label: 'Profil ESN mis à jour',
      detail: 'Contexte commercial',
    })
    expect(actionLabel(t, it2)).toBe('Profil ESN mis à jour')
    expect(actionDetail(t, it2)).toBe('Contexte commercial actualisé')
  })

  it('n’altère PAS les lignes existantes : un message garde son libellé serveur', () => {
    const msg = item({ action_type: 'message_sent', action_label: 'Message envoyé', detail: 'Email' })
    expect(actionLabel(t, msg)).toBe('Message envoyé')
    expect(actionDetail(t, msg)).toBe('Email')
  })

  it('un score en hausse se distingue visuellement d’une baisse', () => {
    expect(statusVariant('En hausse')).toBe('success')
    expect(statusVariant('En baisse')).toBe('warning')
    expect(statusVariant('En hausse')).not.toBe(statusVariant('En baisse'))
    expect(statusVariant('Mis à jour')).toBe('info')
  })
})
