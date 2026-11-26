import { actionTypeSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/manager.json'
import en from '@/i18n/locales/en/manager.json'

// R21-FIX point 2 (15/10) : `commercial_status_changed` s'affichait en clé brute sur /team.
// Tout type d'action émis (`actionTypeSchema`) a un libellé FR ET EN — jamais une clé brute à l'écran.
describe('activité de l’équipe — un libellé par type émis', () => {
  const types = actionTypeSchema.options

  it('la garde lit bien le schéma (elle sait dire NON)', () => {
    expect(types.length).toBeGreaterThan(20)
    expect(types).toContain('commercial_status_changed')
  })

  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s : chaque type a un libellé non vide, distinct de la clé', (_lang, bundle) => {
    const events = bundle.activity.events as Record<string, string>
    for (const type of types) {
      expect({ type, label: events[type]?.trim() ? 'ok' : 'manquant' }).toEqual({ type, label: 'ok' })
      expect(events[type]).not.toBe(type)
    }
    expect(events.unknown?.trim()).toBeTruthy()
  })
})
