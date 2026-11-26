import { describe, expect, it } from 'vitest'
import { enrichContactSchema } from './contact.js'

/**
 * #2988 — enrichissement ciblé PAR coordonnée (email pro seul / téléphone pro
 * seul). `only` est additif et optionnel : absent, le comportement reste celui
 * d'avant (les deux coordonnées). Le filtrage réel (aucune écriture, aucun
 * débit, aucun appel fournisseur pour la coordonnée non demandée) vit dans
 * `ContactsService.enrichContact` et `EnrichmentProviders.enrich` — ce test ne
 * couvre que la porte d'entrée du contrat.
 */
describe('enrichContactSchema — #2988 only (email | phone)', () => {
  const base = { first_name: 'Jean', last_name: 'Dupont', organization_name: 'Acme' }

  it('accepte "email"', () => {
    const parsed = enrichContactSchema.parse({ ...base, only: 'email' })
    expect(parsed.only).toBe('email')
  })

  it('accepte "phone"', () => {
    const parsed = enrichContactSchema.parse({ ...base, only: 'phone' })
    expect(parsed.only).toBe('phone')
  })

  it('reste optionnel — absent, comportement historique (les deux coordonnées)', () => {
    const parsed = enrichContactSchema.parse(base)
    expect(parsed.only).toBeUndefined()
  })

  it('refuse une valeur hors énumération', () => {
    expect(() => enrichContactSchema.parse({ ...base, only: 'linkedin' })).toThrow()
  })
})
