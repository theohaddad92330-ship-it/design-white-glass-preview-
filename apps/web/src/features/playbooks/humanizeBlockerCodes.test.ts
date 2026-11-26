import { describe, expect, it } from 'vitest'
import enMissions from '../../i18n/locales/en/missions.json'
import frMissions from '../../i18n/locales/fr/missions.json'
import { humanizeBlockerCodes } from './humanizeBlockerCodes'

const fr = frMissions.readiness.blockers as Record<string, string>
const en = enMissions.readiness.blockers as Record<string, string>
const CODES = ['missing_timesheet', 'missing_cost', 'missing_po', 'missing_billing_contact']

describe('humanizeBlockerCodes (R24-FIX-B)', () => {
  const detail = `SNCF — mois 2026-08 toujours non facturable après 40 jours. Bloqueurs : ${CODES.join(', ')}.`

  it('les quatre codes de la carte « Facturation bloquée » sortent en français', () => {
    const out = humanizeBlockerCodes(detail, code => fr[code] ?? null)
    for (const code of CODES) expect(out).not.toContain(code)
    expect(out).toContain('Aucun relevé d’activité')
    expect(out).toContain('Bon de commande manquant')
    expect(out).toContain('SNCF — mois 2026-08')
  })

  it('… et en anglais', () => {
    const out = humanizeBlockerCodes(detail, code => en[code] ?? null)
    for (const code of CODES) expect(out).not.toContain(code)
    expect(out).toContain('Purchase order missing')
  })

  it('sait dire NON : un mot snake_case sans libellé reste tel quel, le texte ordinaire est intact', () => {
    expect(humanizeBlockerCodes('code_inconnu et du texte', () => null)).toBe('code_inconnu et du texte')
    expect(humanizeBlockerCodes('Mission sans date de fin.', code => fr[code] ?? null)).toBe(
      'Mission sans date de fin.',
    )
  })

  it('garde : chaque code de bloqueur du contrat a un libellé FR ET EN', async () => {
    const { INVOICE_BLOCKERS } = await import('@bellum/contracts')
    for (const code of [...INVOICE_BLOCKERS, 'missing_cost']) {
      expect(fr[code], `fr ${code}`).toBeTruthy()
      expect(en[code], `en ${code}`).toBeTruthy()
    }
  })
})
