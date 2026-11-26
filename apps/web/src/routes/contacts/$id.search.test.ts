import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/contacts/view/contact-detail/ContactDetailPage', () => ({ ContactDetailPage: () => null }))

import { Route } from './$id'

/**
 * #3674.3 — l'origine `overview` (retour depuis la synthèse du compte) était
 * rejetée par le schéma de la route : `fromTab` retombait sur `undefined` et le
 * fil d'Ariane ne ramenait plus à la synthèse.
 */
function validate(search: Record<string, unknown>): Record<string, unknown> {
  const schema = Route.options.validateSearch as unknown as { parse: (input: unknown) => Record<string, unknown> }
  return schema.parse(search)
}

describe('/contacts/$id — le schéma de recherche garde l’origine (#3674.3)', () => {
  it('accepte fromTab=overview (retour vers la synthèse du compte)', () => {
    expect(validate({ from: 'account', fromId: 'acc-1', fromTab: 'overview' })).toMatchObject({ fromTab: 'overview' })
  })

  it('garde contacts et organigramme', () => {
    expect(validate({ fromTab: 'contacts' })).toMatchObject({ fromTab: 'contacts' })
    expect(validate({ fromTab: 'organigramme' })).toMatchObject({ fromTab: 'organigramme' })
  })

  it('sait dire NON : une origine inconnue disparaît, sans erreur', () => {
    expect(validate({ from: 'account', fromId: 'acc-1', fromTab: 'nimporte-quoi' }).fromTab).toBeUndefined()
  })
})
