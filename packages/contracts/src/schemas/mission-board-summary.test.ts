import { describe, expect, it } from 'vitest'
import {
  MISSION_BOARD_ALERTS,
  MISSION_BOARD_STALE_DAYS,
  summarizeColumn,
  worstAlert,
  type MissionBoardCard,
} from './mission-board.js'

function card(over: Partial<MissionBoardCard> = {}): MissionBoardCard {
  return {
    id: 'mission:1',
    source: 'mission',
    column: 'en_cours',
    label: 'Data Engineer',
    accountName: 'EDF',
    originState: 'active',
    role: 'Data Engineer',
    consultantName: 'Sophie M.',
    endsOn: '2026-12-31',
    dailyRateCents: 62000,
    daysInColumn: 12,
    alert: null,
    ...over,
  }
}

describe('l’en-tête d’une colonne', () => {
  const today = '2026-12-01'

  it('compte les cartes, y compris celles sans date de fin', () => {
    const summary = summarizeColumn([card(), card({ id: 'm2', endsOn: null })], 'en_cours', today)
    expect(summary.count).toBe(2)
  })

  it('EXCLUT du montant les cartes sans date de fin, et les compte à part', () => {
    // C'est la règle du §2.1 : estimer une fin ferait apparaître un revenu que
    // personne n'a signé.
    const withEnd = summarizeColumn([card()], 'en_cours', today)
    const withBoth = summarizeColumn([card(), card({ id: 'm2', endsOn: null })], 'en_cours', today)
    expect(withBoth.remainingRevenueCents).toBe(withEnd.remainingRevenueCents)
    expect(withBoth.withoutEndDateCount).toBe(1)
  })

  it('rend null et non zéro quand aucune carte n’est mesurable', () => {
    // « 0 € » se lirait « plus rien à facturer » ; c'est le contraire de ce
    // qu'on sait.
    const summary = summarizeColumn(
      [card({ endsOn: null }), card({ id: 'm2', dailyRateCents: null })],
      'en_cours',
      today,
    )
    expect(summary.remainingRevenueCents).toBeNull()
    expect(summary.count).toBe(2)
  })

  it('ne compte que les jours OUVRÉS restants', () => {
    // Du 1er au 8 décembre 2026 : 5 jours ouvrés (mar→lun exclu).
    const summary = summarizeColumn([card({ endsOn: '2026-12-08' })], 'en_cours', today)
    expect(summary.remainingRevenueCents).toBe(5 * 62000)
  })

  it('ne rend jamais un montant négatif sur une fin déjà passée', () => {
    const summary = summarizeColumn([card({ endsOn: '2026-01-01' })], 'en_cours', today)
    expect(summary.remainingRevenueCents).toBe(0)
  })

  it('ne compte que les cartes de SA colonne', () => {
    const summary = summarizeColumn([card(), card({ id: 'm2', column: 'terminee' })], 'en_cours', today)
    expect(summary.count).toBe(1)
  })
})

describe('l’alerte d’une carte', () => {
  it('rend la plus grave, jamais une liste', () => {
    expect(worstAlert(['stale', 'invoicing_blocked', 'no_end_date'])).toBe('invoicing_blocked')
  })

  it('rend null quand rien ne s’applique — le cas le plus fréquent', () => {
    expect(worstAlert([])).toBeNull()
  })

  it('respecte l’ordre déclaré comme ordre de gravité', () => {
    for (let index = 0; index < MISSION_BOARD_ALERTS.length - 1; index += 1) {
      const graver = MISSION_BOARD_ALERTS[index]!
      const lighter = MISSION_BOARD_ALERTS[index + 1]!
      expect(worstAlert([lighter, graver])).toBe(graver)
    }
  })
})

describe('le délai de séjour par colonne', () => {
  it('ne fixe AUCUN délai sur « en cours » ni « terminée »', () => {
    // Une mission de dix-huit mois n'est pas en retard parce qu'elle dure.
    expect(MISSION_BOARD_STALE_DAYS.en_cours).toBeNull()
    expect(MISSION_BOARD_STALE_DAYS.terminee).toBeNull()
  })

  it('reprend les délais du document là où il en donne un', () => {
    expect(MISSION_BOARD_STALE_DAYS.a_creer).toBe(3)
    expect(MISSION_BOARD_STALE_DAYS.shortlist_prete).toBe(2)
    expect(MISSION_BOARD_STALE_DAYS.en_veille).toBe(90)
  })
})
