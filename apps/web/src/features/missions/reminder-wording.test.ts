import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/missions.json'
import fr from '@/i18n/locales/fr/missions.json'

/**
 * #2419.8 — « Relance envoyée exige un message_id, sinon préparée ».
 *
 * Aucune relance d'encaissement ne part de Bellum (doctrine
 * `c31_relance_encaissement` : le produit CONSIGNE ce qu'un humain a fait) et
 * aucun `message_id` n'existe donc jamais sur ces lignes. Le compteur ne peut
 * pas dire « envoyée » : ce serait une preuve d'envoi portée par un geste
 * déclaratif (« "Fait" ne porte jamais de preuve d'envoi », Louis 21/09/2026).
 * Il dit « consignée » — dans les DEUX langues (une garde monolingue est
 * aveugle à l'autre).
 */
describe('#2419.8 — le compteur de relances d’encaissement ne prétend jamais un envoi', () => {
  const catalogs = { fr: fr.readiness, en: en.readiness }

  for (const [lang, readiness] of Object.entries(catalogs)) {
    it(`${lang} : la garde LIT les deux formes du compteur`, () => {
      expect(readiness.reminders_one).toContain('{{count}}')
      expect(readiness.reminders_other).toContain('{{count}}')
    })

    it(`${lang} : ni « envoyée » ni « sent » — la relance est CONSIGNÉE`, () => {
      for (const text of [readiness.reminders_one, readiness.reminders_other]) {
        expect(text.toLowerCase()).not.toMatch(/envoy|sent/)
        expect(text.toLowerCase()).toMatch(/consign|logged/)
      }
    })
  }
})
