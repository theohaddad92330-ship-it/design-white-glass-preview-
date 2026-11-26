import { BRIEFING_ACTION_KINDS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/briefing.json'
import fr from '@/i18n/locales/fr/briefing.json'
import { BRIEFING_ACTION_CTA } from './action-cta'

/**
 * #2108.101 / #2108.111 / #2099.50 (épopée #2767) — CRITÈRES NO-GO : aucune
 * carte sans action, aucun CTA générique ou vide.
 *
 * Le comportement était juste (lot du 28/09 matin), mais rien ne l'ASSURAIT
 * pour un genre de carte ajouté demain : un genre sans entrée dans
 * `BRIEFING_ACTION_CTA` rend une carte avec un `href` et… aucun lien
 * (`PriorityCard`, `ctaKey && action.href`). Cette garde dit NON à ce genre-là.
 */

/** Les genres qui n'ont PAS de clé de CTA, chacun pour une raison écrite. */
const WITHOUT_CTA_KEY: Record<string, string> = {
  // `href: null` par construction : la carte ouvre `MeetingPrepDialog` par
  // son artefact préparé (`onOpenMeetingPrep`, #2106.35).
  meeting_prep: 'dialogue de préparation',
  // #2095.12 — même dialogue, sur un rendez-vous déjà terminé.
  meeting_no_followup: 'dialogue de préparation',
  // Aucun producteur du brief n'émet ce genre (`briefing-actions.ts`) : il
  // n'existe que dans l'énumération partagée.
  task: 'jamais produit par le brief',
}

const GENERIC = /^(voir plus|en savoir plus|plus|détails|ouvrir|see more|learn more|more|details|open)$/i

function lookup(catalog: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalog)
}

describe('NO-GO du cockpit — chaque carte porte une action nommée', () => {
  it('chaque genre de carte a une clé de CTA, ou une exception écrite — ni plus, ni moins', () => {
    const missing = BRIEFING_ACTION_KINDS.filter(kind => !BRIEFING_ACTION_CTA[kind])
    expect(missing.sort()).toEqual(Object.keys(WITHOUT_CTA_KEY).sort())
  })

  it('#2108.104 — un conflit a sa porte de résolution (le dialogue des deux rendez-vous)', () => {
    expect(BRIEFING_ACTION_CTA.conflict).toBe('actions.cta.conflict')
  })

  it.each(Object.entries(BRIEFING_ACTION_CTA))(
    '%s : libellé présent en FR et EN, jamais vide ni générique',
    (_kind, key) => {
      for (const catalog of [fr, en]) {
        const label = lookup(catalog, key)
        expect(typeof label).toBe('string')
        expect((label as string).trim().length).toBeGreaterThan(0)
        expect(GENERIC.test((label as string).trim())).toBe(false)
      }
    },
  )

  it('la garde sait dire NON : un libellé générique serait refusé', () => {
    expect(GENERIC.test('Voir plus')).toBe(true)
    expect(GENERIC.test('Voir la mission')).toBe(false)
  })
})
