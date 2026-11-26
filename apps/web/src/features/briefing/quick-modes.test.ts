import { describe, expect, it } from 'vitest'
import {
  computeQuickModes,
  deriveQuickModeSignalsFromBriefing,
  guidedSessionItemVolume,
  QUICK_MODE_DURATION_MINUTES,
  QUICK_MODE_KEYS,
  QUICK_MODES_MAX,
  type QuickModeSignals,
} from './quick-modes'

const BASE: QuickModeSignals = {
  hasUpcomingMeetings: false,
  hasFollowUps: false,
  messagingConnected: false,
  vivierCount: null,
  missionsAtRiskCount: 0,
  isManager: false,
}

describe('computeQuickModes (#2100.1-.13)', () => {
  it('#2100.3/#2100.8 — prospecter et remettre le pipe à jour sont toujours présents', () => {
    const modes = computeQuickModes(BASE).map(m => m.key)
    expect(modes).toEqual(['prospect', 'refresh_pipe'])
  })

  it('#2100.11 — aucun rendez-vous : pas de mode préparation', () => {
    expect(computeQuickModes(BASE).some(m => m.key === 'prepare_meetings')).toBe(false)
    expect(computeQuickModes({ ...BASE, hasUpcomingMeetings: true }).some(m => m.key === 'prepare_meetings')).toBe(true)
  })

  it('#2100.10 — vivier vide ou non mesuré : pas de mode positionnement', () => {
    expect(computeQuickModes({ ...BASE, vivierCount: 0 }).some(m => m.key === 'position_consultant')).toBe(false)
    expect(computeQuickModes({ ...BASE, vivierCount: null }).some(m => m.key === 'position_consultant')).toBe(false)
    expect(computeQuickModes({ ...BASE, vivierCount: 3 }).some(m => m.key === 'position_consultant')).toBe(true)
  })

  it('#2100.12 — aucune messagerie : le mode relances reste mais change de forme', () => {
    const withoutMailbox = computeQuickModes({ ...BASE, hasFollowUps: true, messagingConnected: false })
    expect(withoutMailbox.find(m => m.key === 'handle_followups')?.followUpsVariant).toBe('crm_only')

    const withMailbox = computeQuickModes({ ...BASE, hasFollowUps: true, messagingConnected: true })
    expect(withMailbox.find(m => m.key === 'handle_followups')?.followUpsVariant).toBe('messaging')

    expect(computeQuickModes({ ...BASE, hasFollowUps: false }).some(m => m.key === 'handle_followups')).toBe(false)
  })

  it('missions à risque : le mode sécuriser mes missions apparaît seulement s’il y en a', () => {
    expect(computeQuickModes(BASE).some(m => m.key === 'secure_missions')).toBe(false)
    expect(computeQuickModes({ ...BASE, missionsAtRiskCount: 2 }).some(m => m.key === 'secure_missions')).toBe(true)
  })

  it('#2100.13 — manager : note d’arbitrage équipe sur le mode positionnement, jamais ailleurs', () => {
    const asManager = computeQuickModes({ ...BASE, vivierCount: 5, isManager: true })
    expect(asManager.find(m => m.key === 'position_consultant')?.managerNote).toBe(true)
    expect(asManager.filter(m => m.managerNote)).toHaveLength(1)

    const notManager = computeQuickModes({ ...BASE, vivierCount: 5, isManager: false })
    expect(notManager.find(m => m.key === 'position_consultant')?.managerNote).toBe(false)
  })

  it('#2100.2 — jamais plus de six modes', () => {
    const everything: QuickModeSignals = {
      hasUpcomingMeetings: true,
      hasFollowUps: true,
      messagingConnected: true,
      vivierCount: 10,
      missionsAtRiskCount: 4,
      isManager: true,
    }
    const modes = computeQuickModes(everything)
    expect(modes.length).toBeLessThanOrEqual(QUICK_MODES_MAX)
    expect(modes.map(m => m.key)).toEqual([
      'prospect',
      'prepare_meetings',
      'handle_followups',
      'position_consultant',
      'secure_missions',
      'refresh_pipe',
    ])
  })

  it('#2100.9 — un mode non applicable ne fait jamais une ligne', () => {
    const modes = computeQuickModes(BASE)
    expect(modes.some(m => m.key === 'prepare_meetings')).toBe(false)
    expect(modes.some(m => m.key === 'handle_followups')).toBe(false)
    expect(modes.some(m => m.key === 'position_consultant')).toBe(false)
    expect(modes.some(m => m.key === 'secure_missions')).toBe(false)
  })
})

describe('deriveQuickModeSignalsFromBriefing', () => {
  const BASE_INPUT = {
    actions: [] as { kind: string }[],
    agendaServed: true,
    agendaEventCount: 0,
    mailState: 'ready' as const,
    mailAwaitingReplyCount: 0,
    vivierCount: null,
    isManager: false,
  }

  it('un genre mission_end/mission_no_end_date/renewal_not_engaged/payment_overdue compte comme mission à risque', () => {
    const signals = deriveQuickModeSignalsFromBriefing({
      ...BASE_INPUT,
      actions: [{ kind: 'mission_end' }, { kind: 'payment_overdue' }, { kind: 'account' }],
    })
    expect(signals.missionsAtRiskCount).toBe(2)
  })

  it('une relance vient soit d’une action follow_up/reply, soit d’un fil sans réponse', () => {
    expect(deriveQuickModeSignalsFromBriefing(BASE_INPUT).hasFollowUps).toBe(false)
    expect(deriveQuickModeSignalsFromBriefing({ ...BASE_INPUT, actions: [{ kind: 'follow_up' }] }).hasFollowUps).toBe(
      true,
    )
    expect(deriveQuickModeSignalsFromBriefing({ ...BASE_INPUT, mailAwaitingReplyCount: 1 }).hasFollowUps).toBe(true)
    // Messagerie non connectée : un fil sans réponse n'existe pas côté serveur.
    expect(
      deriveQuickModeSignalsFromBriefing({ ...BASE_INPUT, mailState: 'not_connected', mailAwaitingReplyCount: 1 })
        .hasFollowUps,
    ).toBe(false)
  })

  it('messagingConnected suit l’état RÉEL de la messagerie, pas une supposition', () => {
    expect(deriveQuickModeSignalsFromBriefing(BASE_INPUT).messagingConnected).toBe(true)
    expect(deriveQuickModeSignalsFromBriefing({ ...BASE_INPUT, mailState: 'not_connected' }).messagingConnected).toBe(
      false,
    )
  })

  it('un agenda non servi ne produit jamais « rendez-vous à venir »', () => {
    expect(
      deriveQuickModeSignalsFromBriefing({ ...BASE_INPUT, agendaServed: false, agendaEventCount: 3 })
        .hasUpcomingMeetings,
    ).toBe(false)
  })
})

// #2100.15 / #2100.37 (épopée #2918, session guidée) — la durée est FIXE par
// mode et le volume se DÉRIVE de cette durée, jamais l'inverse.
describe('guidedSessionItemVolume (#2100.15/#2100.37)', () => {
  it('#2100.3 — prospecter porte sa durée dans son propre libellé : 45 min', () => {
    expect(QUICK_MODE_DURATION_MINUTES.prospect).toBe(45)
  })

  it('chaque mode porte une durée strictement positive', () => {
    for (const key of QUICK_MODE_KEYS) {
      expect(QUICK_MODE_DURATION_MINUTES[key]).toBeGreaterThan(0)
    }
  })

  it('le volume est un entier positif pour chaque mode — jamais 0, jamais un nombre à virgule', () => {
    for (const key of QUICK_MODE_KEYS) {
      const volume = guidedSessionItemVolume(key)
      expect(Number.isInteger(volume)).toBe(true)
      expect(volume).toBeGreaterThan(0)
    }
  })

  it('un élément plus rapide à traiter propose un volume plus grand, même sur une session plus courte', () => {
    // Prospecter (45 min, ~15 min/compte — recherche approfondie) propose
    // MOINS d'éléments que traiter les relances (20 min, ~2 min/relance —
    // qualification rapide), malgré une session plus longue : c'est le RYTHME
    // par élément qui décide du volume, pas la seule durée.
    expect(guidedSessionItemVolume('handle_followups')).toBeGreaterThan(guidedSessionItemVolume('prospect'))
  })
})
