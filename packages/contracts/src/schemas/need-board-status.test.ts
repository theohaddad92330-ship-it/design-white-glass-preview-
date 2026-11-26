import { describe, expect, it } from 'vitest'
import { NEED_BOARD_STATUSES, NEED_CANDIDATE_STAGE_STATUSES, needBoardStatus } from './need-status.js'
import { SUBMISSION_STAGES } from './submission.js'

// #4343 — les colonnes d'un besoin ne reprennent ni une étape d'affaire ni une
// étape de candidat : chacune vit sur SON écran.
describe('#4343 — aucune colonne partagée entre besoin, affaire et candidat', () => {
  it("les colonnes d'un besoin ne portent aucun nom d'étape de candidat", () => {
    for (const status of NEED_BOARD_STATUSES) {
      expect(SUBMISSION_STAGES as readonly string[]).not.toContain(status)
      expect(NEED_CANDIDATE_STAGE_STATUSES as readonly string[]).not.toContain(status)
    }
  })

  it("« Négociation » (étape d'affaire) et « Entretien » / « Profil proposé » (étapes candidat) ne sont plus des colonnes", () => {
    for (const status of ['negotiation', 'interview', 'submitted', 'client_review']) {
      expect(NEED_BOARD_STATUSES as readonly string[]).not.toContain(status)
    }
  })

  it("un besoin déjà stocké à une étape candidat s'affiche dans la dernière colonne du besoin, sans réécriture", () => {
    for (const status of NEED_CANDIDATE_STAGE_STATUSES) {
      expect(needBoardStatus(status)).toBe('shortlist_ready')
    }
    expect(needBoardStatus('matching')).toBe('matching')
    expect(needBoardStatus('won')).toBe('won')
  })
})
