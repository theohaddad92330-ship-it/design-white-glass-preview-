import { describe, expect, it } from 'vitest'
import { REPORT_STATUSES, isReportStatus } from './beta-feedback-status.js'

/**
 * #1960.10 — les états qu'un auteur lit sur « Mes signalements ».
 *
 * Quatre, pas cinq : « état indisponible » n'est PAS un état du signalement,
 * c'est l'absence de mesure. Le mettre dans la liste le rendrait comparable aux
 * autres — et un jour de panne, un filtre « tout sauf corrigé » le compterait
 * comme du travail en attente.
 */
describe('#1960.10 — les états d’un signalement', () => {
  it('nomme quatre états, dans l’ordre du traitement', () => {
    expect(REPORT_STATUSES).toEqual(['received', 'in_progress', 'fixed', 'closed_unresolved'])
  })

  it('reconnaît chacun des quatre', () => {
    for (const status of REPORT_STATUSES) expect(isReportStatus(status)).toBe(true)
  })

  it('sait dire NON — « non mesuré » n’est jamais un état', () => {
    for (const value of ['unavailable', 'unknown', 'open', 'closed', '', null, undefined, 0, {}]) {
      expect(isReportStatus(value), String(value)).toBe(false)
    }
  })
})
