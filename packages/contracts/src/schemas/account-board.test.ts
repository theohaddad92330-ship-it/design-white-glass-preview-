import { describe, expect, it } from 'vitest'
import { BOARD_STATUSES, isActionable, isSimilarityExplainable, resolveBoardStatus } from './account-board.js'

const NOW = new Date('2026-08-03T12:00:00.000Z')
const HIER = '2026-08-02T12:00:00.000Z'
const DEMAIN = '2026-08-04T12:00:00.000Z'

describe('les sept statuts de la liste (§20)', () => {
  it('les sept du rapport, pas cinq', () => {
    expect(BOARD_STATUSES).toHaveLength(7)
    expect(BOARD_STATUSES).toContain('to_analyse')
    expect(BOARD_STATUSES).toContain('to_follow_up')
  })

  it('un compte sans dossier est « à analyser », quoi que dise sa colonne', () => {
    // Proposer de relancer un compte qu'on n'a jamais analysé enverrait un
    // commercial parler sans rien savoir.
    expect(resolveBoardStatus({ commercialStatus: 'opportunity', hasAnalysis: false, now: NOW })).toBe('to_analyse')
    expect(resolveBoardStatus({ commercialStatus: 'watching', hasAnalysis: false, now: NOW })).toBe('to_analyse')
  })

  it('une échéance passée passe devant « en cours »', () => {
    // Une échéance dépassée est l'information la plus actionnable de la liste ;
    // la noyer dans « en cours » revient à ne pas la donner.
    expect(
      resolveBoardStatus({ commercialStatus: 'opportunity', hasAnalysis: true, nextActionDueAt: HIER, now: NOW }),
    ).toBe('to_follow_up')
    expect(
      resolveBoardStatus({ commercialStatus: 'opportunity', hasAnalysis: true, nextActionDueAt: DEMAIN, now: NOW }),
    ).toBe('in_progress')
  })

  it('client et écarté sont des décisions fermes — elles priment même sans dossier', () => {
    expect(resolveBoardStatus({ commercialStatus: 'customer', hasAnalysis: false, now: NOW })).toBe('customer')
    expect(resolveBoardStatus({ commercialStatus: 'archived', hasAnalysis: false, now: NOW })).toBe('discarded')
  })

  it('un compte analysé que personne n’a trié est « à ouvrir »', () => {
    expect(resolveBoardStatus({ commercialStatus: 'inbox', hasAnalysis: true, now: NOW })).toBe('to_open')
    expect(resolveBoardStatus({ hasAnalysis: true, now: NOW })).toBe('to_open')
  })

  it('une échéance absente ou illisible n’est pas un retard', () => {
    // On ne reproche pas à quelqu'un un rendez-vous qu'on n'a pas noté.
    for (const due of [null, undefined, '', 'pas une date']) {
      expect(
        resolveBoardStatus({ commercialStatus: 'opportunity', hasAnalysis: true, nextActionDueAt: due, now: NOW }),
      ).toBe('in_progress')
    }
  })

  it('trois statuts demandent quelque chose, les autres non', () => {
    expect(isActionable('to_follow_up')).toBe(true)
    expect(isActionable('to_analyse')).toBe(true)
    expect(isActionable('customer')).toBe(false)
    expect(isActionable('discarded')).toBe(false)
  })
})

describe('une recommandation de compte proche doit être explicable (§19-20)', () => {
  it('sans motif, elle ne s’affiche pas', () => {
    // Une suggestion sans raison se lit comme du hasard. « Proposé à partir du
    // secteur de vos comptes récents » décrit un algorithme, pas une raison.
    expect(isSimilarityExplainable([])).toBe(false)
    expect(isSimilarityExplainable(null)).toBe(false)
    expect(isSimilarityExplainable(['   '])).toBe(false)
  })

  it('avec un motif, elle s’affiche', () => {
    expect(isSimilarityExplainable(['même secteur, même taille'])).toBe(true)
  })
})
