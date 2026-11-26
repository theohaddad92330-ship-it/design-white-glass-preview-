import { describe, expect, it } from 'vitest'
import { buildBriefingExportText } from './export-text'

/**
 * #2994 — EXPORTER LE BRIEF DU JOUR.
 *
 * Même patron que `agenda.brief.export` (`MeetingPrepDialog.tsx`) : un texte
 * simple, numéroté, sans mise en forme qui ne survivrait pas à un collage
 * ailleurs. La fonction est PURE — le geste (presse-papiers, confirmation)
 * reste dans le composant, comme pour `exportBrief`.
 */
describe('buildBriefingExportText (#2994)', () => {
  it('porte l’en-tête seule quand il n’y a aucune priorité — pas de "0 priorité" fabriqué', () => {
    expect(buildBriefingExportText({ dayLabel: 'Aujourd’hui — 08:30', priorityLines: [] })).toBe('Aujourd’hui — 08:30')
  })

  it('numérote les priorités, dans l’ordre reçu', () => {
    const text = buildBriefingExportText({
      dayLabel: 'Aujourd’hui — 08:30',
      priorityLines: ['Relancer Jean (ACME)', 'Préparer le point besoin'],
    })
    expect(text).toBe(['Aujourd’hui — 08:30', '', '1. Relancer Jean (ACME)', '2. Préparer le point besoin'].join('\n'))
  })
})
