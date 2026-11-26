import { describe, expect, it } from 'vitest'
import frPricing from '../../../../messages/fr/pricing.json'
import { PUBLIC_FEATURES, renderPublicFeatureStatus } from './feature-status'
import { renderPublicPricing } from './public-pricing'
import { SlidingWindowCounter } from './rate-limit'
import { CREDIT_WEIGHTS } from '@bellum/contracts'

describe('tarifs — lus depuis la page, jamais réécrits', () => {
  const rendered = renderPublicPricing(frPricing)

  it('cite les offres RÉELLES du catalogue affiché au visiteur', () => {
    // Si un jour la grille change et que ce test tombe, c'est le signal qu'on
    // s'apprêtait à faire dire à Laura autre chose que la page /tarifs.
    //
    // Grille du 27/08 : trois cartes, un seul palier achetable. Laura doit
    // pouvoir nommer les trois — un visiteur qui demande « c'est combien ? »
    // mérite d'entendre la gratuite et le devis, pas seulement le prix.
    expect(rendered).toContain('Free')
    expect(rendered).toContain('Growth')
    expect(rendered).toContain('Entreprise')
    expect(rendered).toContain(frPricing.plans.items[0].price.monthly)
    // Et elle ne doit PAS nommer un palier retiré de la vente : ce serait
    // proposer au visiteur une offre qu'aucun bouton ne peut acheter.
    expect(rendered).not.toContain('Starter')
  })

  it('porte ce qu’est un crédit — un prix sans son unité n’informe personne', () => {
    // Ce qu'on vérifie est que la NOTE est rendue, et qu'elle dit ce qu'un
    // crédit achète. La chaîne exacte « 1 crédit » ne peut plus servir de
    // repère : elle datait du moment où toute action coûtait un crédit, et
    // c'est précisément l'affirmation que la page a cessé de faire — une
    // analyse en coûte huit. Chercher l'ancienne formule ferait échouer la
    // garde sur la page CORRIGÉE.
    expect(rendered).toContain(frPricing.plans.notes.credit)
    expect(rendered).toMatch(new RegExp(`\\b${CREDIT_WEIGHTS.account_analysis}\\b`))
  })

  it('rend null plutôt qu’un bloc vide quand le catalogue est illisible', () => {
    // Un bloc TARIFS vide se lirait « BellumAI est gratuit ».
    expect(renderPublicPricing(null)).toBeNull()
    expect(renderPublicPricing({})).toBeNull()
    expect(renderPublicPricing({ plans: { items: [{ noName: true }] } })).toBeNull()
  })

  it('ne tombe jamais sur une forme inattendue', () => {
    expect(() => renderPublicPricing({ plans: { items: 'nope', free: 42 } })).not.toThrow()
  })
})

describe('statuts de fonction', () => {
  it('distingue disponible, bêta et « sur activation »', () => {
    const rendered = renderPublicFeatureStatus() ?? ''
    expect(rendered).toContain('disponible')
    expect(rendered).toContain('en bêta')
    expect(rendered).toContain('sur activation')
  })

  it('ne nomme AUCUN éditeur — le site dit la capacité, pas la marque', () => {
    const rendered = renderPublicFeatureStatus() ?? ''
    for (const vendor of [
      'HubSpot',
      'Salesforce',
      'Pipedrive',
      'Gmail',
      'Outlook',
      'Google',
      'Microsoft',
      'BoondManager',
    ]) {
      expect(rendered).not.toContain(vendor)
    }
  })

  it('n’a pas de doublon de clé', () => {
    const keys = PUBLIC_FEATURES.map(feature => feature.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('rend null sur une table vide', () => {
    expect(renderPublicFeatureStatus([])).toBeNull()
  })
})

describe('borne de fréquence', () => {
  it('compte dans une fenêtre glissante', () => {
    const counter = new SlidingWindowCounter({ windowMs: 1000, max: 2 })
    expect(counter.hit('a', 0)).toEqual({ count: 1, limited: false })
    expect(counter.hit('a', 100)).toEqual({ count: 2, limited: false })
    expect(counter.hit('a', 200)).toEqual({ count: 3, limited: true })
    // La fenêtre glisse : les deux premiers coups sont sortis.
    expect(counter.hit('a', 1150)).toEqual({ count: 2, limited: false })
  })

  it('sépare les clés', () => {
    const counter = new SlidingWindowCounter({ windowMs: 1000, max: 1 })
    counter.hit('a', 0)
    expect(counter.hit('b', 0).limited).toBe(false)
  })

  it('compte le coup refusé — sinon on ressort du plafond en ralentissant', () => {
    const counter = new SlidingWindowCounter({ windowMs: 1000, max: 1 })
    counter.hit('a', 0)
    counter.hit('a', 10)
    expect(counter.count('a', 20)).toBe(2)
  })

  it('borne la table de compteurs — un endpoint public voit un nombre inconnu de visiteurs', () => {
    const counter = new SlidingWindowCounter({ windowMs: 1000, max: 5, maxKeys: 10 })
    for (let i = 0; i < 500; i += 1) counter.hit(`visiteur-${i}`, i)
    // La borne s'applique et le compteur reste utilisable.
    expect(counter.hit('visiteur-499', 500).limited).toBe(false)
  })
})
