import { describe, expect, it } from 'vitest'
import { contactDiscoveryRunRequestSchema, discoveryTitlesFor, matchedExpertiseIds } from './contact-discovery.js'

describe('#4058 — expertise, secteur, périmètre et type de personne restent distincts', () => {
  it('« GRC » et sa forme développée sont le même besoin', () => {
    expect(matchedExpertiseIds('GRC')).toEqual(['grc'])
    expect(matchedExpertiseIds('gouvernance, risque et conformité')).toEqual(['grc'])
    expect(matchedExpertiseIds('Governance Risk & Compliance')).toEqual(['grc'])
  })

  it('une expertise inconnue ne dérive aucun intitulé (rien d’inventé)', () => {
    expect(matchedExpertiseIds('fiscalité')).toEqual([])
    expect(discoveryTitlesFor({ expertise: 'fiscalité' })).toBeUndefined()
  })

  it('le secteur ne remplace pas la compétence : il ne pèse sur aucun intitulé', () => {
    const cyber = discoveryTitlesFor({ expertise: 'cyber GRC' })
    expect(cyber).toContain('RSSI')
    expect(cyber).toContain('Responsable GRC')
    // « énergie » est un secteur : le schéma le garde À PART, il n'entre pas dans les intitulés.
    const parsed = contactDiscoveryRunRequestSchema.parse({ expertise: 'cyber GRC', sector: 'énergie' })
    expect(discoveryTitlesFor(parsed)).toEqual(cyber)
    expect(parsed.sector).toBe('énergie')
    expect(parsed.expertise).toBe('cyber GRC')
  })

  it('les intitulés nommés passent en premier, sans doublon, et rien n’est requis', () => {
    expect(discoveryTitlesFor({ titles: ['DSI', 'RSSI'], expertise: 'cyber' })?.slice(0, 2)).toEqual(['DSI', 'RSSI'])
    expect(discoveryTitlesFor({ titles: ['DSI', 'RSSI'], expertise: 'cyber' })?.filter(t => t === 'RSSI')).toHaveLength(
      1,
    )
    expect(discoveryTitlesFor({})).toBeUndefined()
    expect(contactDiscoveryRunRequestSchema.safeParse({}).success).toBe(true)
  })
})
