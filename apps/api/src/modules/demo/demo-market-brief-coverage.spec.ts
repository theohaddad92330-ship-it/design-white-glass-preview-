import { checkMarketBrief, marketBriefSchema } from '@bellum/contracts'

import { COMMERCIAL_BRIEF_BY_COMPANY } from './commercial-brief-seed'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { demoCompletenessProbes } from './demo-reset.service'
import { DemoSeedService } from './demo-seed.service'
import { DEMO_MARKET_ZONES, marketZoneInsertParams } from './market-brief-seed'
import { linkAccountsToZone } from '../market-brief/zone-accounts'

/**
 * Marchés locaux (lot L5, 05/10/2026) — ce que la SALLE DE DÉMONSTRATION porte : quatre zones (Lille, Nantes–Saint-Nazaire,
 * Lyon et axe Genève, Suisse romande), semées depuis les trois classeurs fournis, 0 appel LLM. Le convertisseur qui les
 * produit est tenu par `scripts/market-brief/market-engine.spec.ts` ; ici, ce que le JEU DE DONNÉES de la salle en fait.
 */

const zone = (slug: string) => {
  const found = DEMO_MARKET_ZONES.find(candidate => candidate.slug === slug)
  expect(found).toBeDefined()
  return found!
}

/** Les comptes de la salle (noms et sièges des VRAIS dossiers de démo) et leurs sites, tels que le service de zone les lit. */
const demoAccounts = () =>
  Object.keys(COMMERCIAL_BRIEF_BY_COMPANY).map(company => {
    const dossier = DEMO_DOSSIERS.find(candidate => candidate.account.company_name === company)
    expect(dossier).toBeDefined()
    return { id: company, name: company, headquarters: dossier!.account.headquarters }
  })
const demoSites = () =>
  Object.entries(COMMERCIAL_BRIEF_BY_COMPANY).flatMap(([company, brief]) =>
    brief.sites.map(site => ({ account_id: company, city: site.city, postal_code: null })),
  )

const linkedTo = (slug: string): string[] => {
  const { brief } = zone(slug)
  return linkAccountsToZone({
    zone: {
      scope: brief.zone.scope,
      departments: brief.zone.departments,
      cantons: brief.zone.cantons,
      cities: brief.zone.cities,
    },
    accounts: demoAccounts(),
    sites: demoSites(),
    brief,
  })
    .map(link => link.account_id)
    .sort()
}

describe('marchés locaux — la démo porte quatre zones', () => {
  it('quatre zones, des slugs uniques, et chacune valide au contrat ET aux contrôles métier', () => {
    expect(DEMO_MARKET_ZONES.map(z => z.slug)).toEqual([
      'lille',
      'nantes-saint-nazaire',
      'lyon-axe-geneve',
      'suisse-romande',
    ])
    for (const { slug, brief } of DEMO_MARKET_ZONES) {
      expect(marketBriefSchema.safeParse(brief).success).toBe(true)
      expect(checkMarketBrief(brief)).toEqual([])
      expect(brief.guardrails.length).toBeGreaterThan(0)
      expect(slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('les périmètres sont ceux du plan (D4 : jamais France et Suisse mêlées)', () => {
    expect(zone('lille').brief.zone).toMatchObject({ scope: 'france', departments: ['59'], cantons: [] })
    expect(zone('nantes-saint-nazaire').brief.zone).toMatchObject({ scope: 'france', departments: ['44'], cantons: [] })
    expect(zone('lyon-axe-geneve').brief.zone).toMatchObject({
      scope: 'france',
      departments: ['69', '01', '38', '73', '74'],
      cantons: [],
    })
    expect(zone('suisse-romande').brief.zone).toMatchObject({ scope: 'suisse', departments: [], cantons: ['GE', 'VD'] })
  })

  it('ce que chaque zone porte : clients, ESN et personnes EN CLAIR (D5), pas un squelette', () => {
    const lille = zone('lille').brief
    expect(lille.clients?.length).toBe(259)
    expect(lille.esn.length).toBe(89)
    expect(lille.people.length).toBe(453)
    expect(lille.price_grid?.sample_size).toBe(231)
    expect(lille.price_grid?.top_client).toEqual({ name: 'ADEO', n: 190 })
    expect(lille.groups?.[0]?.name).toBe('Galaxie Mulliez')
    expect(lille.price_trend?.map(p => p.year)).toEqual([2021, 2022, 2023, 2024])

    const nantes = zone('nantes-saint-nazaire').brief
    expect(nantes.clients?.length).toBe(94)
    expect(nantes.esn.length).toBe(39)
    expect(nantes.people.length).toBe(107)
    expect(nantes.calendar?.length).toBe(7)

    const lyon = zone('lyon-axe-geneve').brief
    expect(lyon.clients?.length).toBe(315)
    expect(lyon.esn.length).toBe(100)
    expect(lyon.people.length).toBe(375)

    const suisse = zone('suisse-romande').brief
    expect(suisse.rules?.length).toBe(25)
    expect(suisse.what_i_know.length).toBeGreaterThan(5)
  })

  // Recette 06/10/2026 — la tuile « 25 » de la Suisse romande n'avait aucune unité ; et « 1 profils / 1 externes »
  // s'écrivaient au pluriel dans la preuve des ESN.
  it('la tuile de règles de la Suisse romande dit ce qu’elle compte, et aucun « 1 » n’est suivi d’un pluriel', () => {
    const tile = zone('suisse-romande').brief.kpis.find(kpi => kpi.value === 25)
    expect(tile?.label).toBe('SUISSE — RÈGLES LOCALES')
    for (const { brief } of DEMO_MARKET_ZONES) {
      expect(JSON.stringify(brief)).not.toMatch(/(^|[^\d.,])1 (profils|externes|besoins)\b/)
    }
  })

  it('les personnes sont en clair : au moins un e-mail et un mobile lisibles par zone française, jamais masqués', () => {
    for (const slug of ['lille', 'nantes-saint-nazaire', 'lyon-axe-geneve']) {
      const { people } = zone(slug).brief
      expect(people.some(p => /@/.test(p.email ?? '') && !/\*{2,}|•{2,}/.test(p.email ?? ''))).toBe(true)
      expect(people.every(p => p.role === 'external' && p.name.length > 0)).toBe(true)
    }
    const withMobile = zone('nantes-saint-nazaire').brief.people.find(p => p.mobile)
    expect(withMobile?.mobile).toMatch(/\d/)
  })

  it('aucun nom d’ESN prospect ni de fournisseur de données dans les zones', () => {
    for (const { slug, brief } of DEMO_MARKET_ZONES) {
      const text = JSON.stringify(brief).replace(/[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g, '')
      expect(`${slug}: ${/meedz|n\s?gen\b|alpineo|quicksort|one\s?side|th[ée]lio|dataforge/i.test(text)}`).toBe(
        `${slug}: false`,
      )
    }
  })

  describe('comptes de la salle liés à chaque zone — réellement résolus, pas seulement affirmés', () => {
    it('Lille → ADEO et Kiabi (et aucun compte nantais, lyonnais ou suisse)', () => {
      const linked = linkedTo('lille')
      expect(linked).toEqual(expect.arrayContaining(['ADEO - Leroy Merlin', 'Kiabi']))
      expect(linked).not.toContain('ABB Suisse')
      expect(linked).not.toContain("Chantiers de l'Atlantique")
    })

    it('Nantes–Saint-Nazaire → Naval Group et Chantiers de l’Atlantique', () => {
      const linked = linkedTo('nantes-saint-nazaire')
      expect(linked).toEqual(expect.arrayContaining(['Naval Group', "Chantiers de l'Atlantique"]))
      expect(linked).not.toContain('Kiabi')
    })

    it('Lyon et axe Genève → Sanofi', () => {
      expect(linkedTo('lyon-axe-geneve')).toContain('Sanofi')
    })

    it('Suisse romande → ABB Suisse, et AUCUN compte français (D4)', () => {
      expect(linkedTo('suisse-romande')).toEqual(['ABB Suisse'])
    })
  })

  describe('la salle sème la table — et la sonde de complétude la couvre', () => {
    it('market_zones est déclarée SEEDÉE, plus « vide à dessein »', () => {
      expect(DEMO_SEEDED_TABLES as readonly string[]).toContain('market_zones')
      expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('market_zones')
    })

    it('la sonde « salle incomplète » sonde market_zones sur la salle — sans elle, une table semée à moitié ne se répare jamais', () => {
      const probe = demoCompletenessProbes().find(p => p.table === 'market_zones')
      expect(probe).toEqual({ table: 'market_zones', where: 'workspace_id = $1' })
    })

    it('le semis écrit une ligne par zone, scopée à la salle ($1 = workspace_id) : la sonde les trouve, la salle n’est pas purgée en boucle', async () => {
      const query = jest.fn().mockResolvedValue([])
      const service = Object.create(DemoSeedService.prototype) as {
        accounts: unknown
        seedMarketZones: (w: string, u: string) => Promise<void>
      }
      service.accounts = { manager: { query } }
      await service.seedMarketZones('ws-demo', 'user-demo')
      expect(query).toHaveBeenCalledTimes(DEMO_MARKET_ZONES.length)
      for (const [sql, params] of query.mock.calls as [string, unknown[]][]) {
        expect(sql).toMatch(/INSERT INTO market_zones/)
        expect(sql).toMatch(/ON CONFLICT \(workspace_id, slug\) DO NOTHING/)
        expect(params[0]).toBe('ws-demo')
      }
      const slugs = (query.mock.calls as [string, unknown[]][]).map(([, params]) => params[1])
      expect(slugs).toEqual(DEMO_MARKET_ZONES.map(z => z.slug))
    })

    it('les paramètres d’insertion portent le brief validé, son origine « seed » et rien d’un coût d’IA', () => {
      const params = marketZoneInsertParams(zone('lille'), 'ws', 'user')
      expect(params).toMatchObject([
        'ws',
        'lille',
        'Lille et métropole (59)',
        'france',
        ['59'],
        [],
        expect.arrayContaining(['Lille']),
        expect.any(String),
        zone('lille').brief.generated_at,
        'user',
      ])
      expect(JSON.parse(params[7] as string)).toEqual(zone('lille').brief)
      // pas de coût, pas de somme de contrôle d'entrée : un brief SEMÉ n'a coûté aucun appel (0 LLM)
      expect(params).toHaveLength(10)
    })
  })
})
