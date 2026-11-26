import { describe, expect, it } from 'vitest'
import type { ContactLifecycleTally } from '@bellum/contracts'
import { lauraPageContextSchema, renderLauraPageContext } from '@bellum/contracts'
import { contactsLauraContext } from './contacts-laura-context'

/**
 * #2309.33 — CE QUE L'ÉCRAN CONTACTS DIT À LAURA.
 *
 * `t` de test rend la clé : on vérifie QUELLE phrase part, pas sa traduction —
 * même convention que `vivier-laura-context.test.ts`.
 */
const t = ((key: string) => key) as unknown as Parameters<typeof contactsLauraContext>[0]

function tally(partial: Partial<ContactLifecycleTally>): ContactLifecycleTally {
  return {
    detecte: 0,
    identite_verifiee: 0,
    qualifie: 0,
    enrichi: 0,
    actionnable: 0,
    historique: 0,
    rejete: 0,
    ...partial,
  }
}

const READY = { isLoading: false, lifecycleTally: tally({ detecte: 12, actionnable: 3 }), activeFilterCount: 0 }

describe('contactsLauraContext', () => {
  it('dit à quoi sert l’écran, le total détecté et les prêts à contacter', () => {
    const context = contactsLauraContext(t, READY)
    expect(context.label).toBe('page.title')
    expect(context.purpose).toBe('laura.purpose')
    expect(context.facets).toContainEqual({ label: 'laura.total', value: '15' })
    expect(context.facets).toContainEqual({ label: 'laura.ready', value: '3' })
    expect(context.actions).toEqual(['page.addContact', 'page.importContacts'])
  })

  it('un total MESURÉ à zéro, sans filtre posé, se déclare comme un manque', () => {
    const context = contactsLauraContext(t, { ...READY, lifecycleTally: tally({}) })
    expect(context.missing).toEqual(['laura.emptyPool'])
  })

  it('un filtre qui ramène 0 contact n’est PAS un stock vide', () => {
    const context = contactsLauraContext(t, { ...READY, lifecycleTally: tally({}), activeFilterCount: 1 })
    expect(context.missing).toBeUndefined()
    expect(context.facets).toContainEqual({ label: 'laura.filtersActive', value: '1' })
  })

  it('un agrégat non mesuré (chargement, échec réseau) ne déclare ni total ni « prêts »', () => {
    const context = contactsLauraContext(t, { ...READY, lifecycleTally: undefined })
    expect(context.facets.some(facet => facet.label === 'laura.total')).toBe(false)
    expect(context.facets.some(facet => facet.label === 'laura.ready')).toBe(false)
    expect(context.missing).toBeUndefined()
  })

  it('pendant le chargement, se déclare en chargement', () => {
    const context = contactsLauraContext(t, { ...READY, isLoading: true })
    expect(context.state).toBe('loading')
  })

  it('reste un contexte VALIDE — sinon il ne partirait pas', () => {
    const context = contactsLauraContext(t, READY)
    expect(lauraPageContextSchema.safeParse(context).success).toBe(true)
  })

  it('arrive jusqu’au texte lu par le modèle', () => {
    const rendered = renderLauraPageContext(contactsLauraContext(t, { ...READY, lifecycleTally: tally({}) }))
    expect(rendered).toContain('laura.purpose')
    expect(rendered).toContain('laura.emptyPool')
    expect(rendered).toContain('page.addContact')
  })
})
