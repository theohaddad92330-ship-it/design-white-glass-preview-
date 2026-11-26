import { describe, expect, it } from 'vitest'
import { bulkEnrichmentCost } from '@bellum/contracts'
import { planBulkEnrichment } from './enrichBilling'

/**
 * Ce que ces tests tiennent : l'ensemble ANNONCÉ est l'ensemble ENVOYÉ.
 *
 * Ils épinglent aussi les frontières du prédicat — celles qui surprennent, et
 * qu'un écran ne doit pas réinventer « au bon sens ». Deux d'entre elles ont
 * une conséquence produit qui mérite d'être connue plutôt que découverte :
 * un contact qui n'a QUE son LinkedIn est facturable, et un contact qui a un
 * e-mail mais aucun LinkedIn ne l'est pas — même quand c'est le LinkedIn qu'on
 * cherche. La décision appartient au contrat, pas à la vue.
 */

const named = { full_name: 'Alice Martin' }

describe('planBulkEnrichment — le contrat décide, la vue ne recompte pas', () => {
  it('retient un contact sans aucune coordonnée dont l’identité est résolue', () => {
    const plan = planBulkEnrichment([{ ...named, id: 'a' }])
    expect(plan.billableContacts.map(c => c.id)).toEqual(['a'])
    expect(plan.maxCredits).toBe(1)
  })

  it('écarte un contact déjà pourvu d’un e-mail — le facturer serait payer deux fois', () => {
    expect(planBulkEnrichment([{ ...named, id: 'a', email: 'a@corp.co' }]).billableContacts).toEqual([])
  })

  it('écarte un contact déjà pourvu d’un téléphone', () => {
    expect(planBulkEnrichment([{ ...named, id: 'a', phone: '+33100000000' }]).billableContacts).toEqual([])
  })

  it('écarte un contact dont l’identité n’est pas résolue — la question serait mal posée', () => {
    expect(planBulkEnrichment([{ id: 'a', full_name: null }]).billableContacts).toEqual([])
    expect(planBulkEnrichment([{ id: 'a', full_name: '   ' }]).billableContacts).toEqual([])
  })

  it('RETIENT un contact qui n’a que son LinkedIn — un profil n’est pas une coordonnée', () => {
    const plan = planBulkEnrichment([{ ...named, id: 'a', linkedin_url: 'https://example.org/in/a' }])
    expect(plan.billableContacts.map(c => c.id)).toEqual(['a'])
  })

  it('rend un plan VIDE plutôt qu’un coût nul déguisé', () => {
    const plan = planBulkEnrichment([{ ...named, id: 'a', email: 'a@corp.co' }])
    // `maxCredits` vaut bien 0, et c'est précisément pourquoi les appelants
    // testent la TAILLE du plan : « 0 crédit » à l'écran se lirait « je vais
    // débiter zéro », alors qu'il n'y a rien à acheter.
    expect(plan.billableContacts).toHaveLength(0)
    expect(plan.maxCredits).toBe(0)
  })

  it('annonce EXACTEMENT ce qu’il envoie, sur un lot mêlé', () => {
    const selection = [
      { ...named, id: 'facturable-1' },
      { ...named, id: 'facturable-2' },
      { ...named, id: 'a-un-email', email: 'x@corp.co' },
      { ...named, id: 'a-un-tel', phone: '+33100000000' },
      { id: 'sans-nom', full_name: null },
    ]
    const plan = planBulkEnrichment(selection)

    expect(plan.billableContacts.map(c => c.id)).toEqual(['facturable-1', 'facturable-2'])
    // L'invariant : le nombre affiché mesure l'ensemble qui part, et rien
    // d'autre. Recalculé ici PAR LE CONTRAT sur le seul ensemble envoyé.
    expect(plan.maxCredits).toBe(bulkEnrichmentCost(plan.billableContacts).maxCredits)
    expect(bulkEnrichmentCost(plan.billableContacts).billable).toBe(plan.billableContacts.length)
  })

  // #2297.25 / #2297.26 — l'écart entre la sélection et le plan est maintenant
  // NOMMÉ, pas seulement mesurable en soustrayant deux longueurs.
  it('#2297.25/#2297.26 — nomme pourquoi le reste de la sélection ne part pas', () => {
    const selection = [
      { ...named, id: 'facturable-1' },
      { ...named, id: 'a-un-email', email: 'x@corp.co' },
      { ...named, id: 'a-un-tel', phone: '+33100000000' },
      { id: 'sans-nom', full_name: null },
    ]
    expect(planBulkEnrichment(selection).excluded).toEqual([
      { reason: 'identity_unresolved', count: 1 },
      { reason: 'already_has_contact_info', count: 2 },
    ])
  })

  it('aucune exclusion à annoncer quand tout le lot part', () => {
    expect(planBulkEnrichment([{ ...named, id: 'a' }]).excluded).toEqual([])
  })

  it('préserve l’ordre et l’identité des objets — ce sont les mêmes contacts qui partent', () => {
    const first = { ...named, id: 'un' }
    const second = { ...named, id: 'deux' }
    const plan = planBulkEnrichment([first, second])
    expect(plan.billableContacts[0]).toBe(first)
    expect(plan.billableContacts[1]).toBe(second)
  })

  it('rend un plan vide sur une sélection vide, sans lever', () => {
    expect(planBulkEnrichment([])).toEqual({ billableContacts: [], maxCredits: 0, excluded: [] })
  })
})
