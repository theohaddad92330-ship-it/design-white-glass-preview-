import { checkCommercialBrief, commercialBriefSchema, normalizeTags, orgGraphSchema } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'

import {
  COMMERCIAL_BRIEF_BY_COMPANY,
  COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY,
  DEMO_REAL_CONTACTS_COMPANIES,
  briefPartners,
  briefRecentSignals,
  commercialBriefOf,
} from './commercial-brief-seed'
import { DEMO_COMMERCIAL_BRIEF_COVERAGE } from './demo-coverage'
import { DEMO_EXTENSION_ACCOUNTS, DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * 15/10/2026 — les quatre dossiers de compte déposés par Théo (Crédit Agricole, VINCI, Enedis, Safran) sont CONSOMMÉS :
 * un fichier que personne ne lit n'est pas livré. Ce spec PROUVE, sur les données de la salle, que chaque compte porte
 * son brief et que chaque consommateur le lit (« Ce que je sais », Veille, ESN présentes, organigramme, sites, contacts).
 */
const ACCOUNTS = ['Crédit Agricole', 'VINCI', 'Enedis', 'Safran'] as const

describe.each(ACCOUNTS)('compte « %s » de la salle — le dossier de compte est lu (15/10/2026)', name => {
  const account = DEMO_EXTENSION_ACCOUNTS.find(candidate => candidate.company_name === name)
  const brief = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[name]
  const raw = (account?.raw_analysis ?? {}) as Record<string, unknown>

  it('un registre à part (compte d’extension), jamais un doublon d’un dossier de brief', () => {
    expect(brief).toBeDefined()
    expect(COMMERCIAL_BRIEF_BY_COMPANY[name]).toBeUndefined()
    expect(commercialBriefOf(name)).toBe(brief)
    expect(DEMO_REAL_CONTACTS_COMPANIES.has(name)).toBe(true)
    expect(DEMO_EXTENSION_ACCOUNTS.filter(candidate => candidate.company_name === name)).toHaveLength(1)
  })

  it('raw_analysis.commercial_brief porte le brief, valide pour le schéma ET les contrôles métier', () => {
    const parsed = commercialBriefSchema.safeParse(raw['commercial_brief'])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(checkCommercialBrief(parsed.data)).toEqual([])
    expect(parsed.data).toEqual(brief)
  })

  it('la Veille lit les projets du dossier, source « Dossier de compte (15/10/2026) »', () => {
    const projects = briefRecentSignals(brief!).filter(signal => signal.type === 'projet')
    expect(projects.length).toBeGreaterThan(5)
    const fromDossier = (account?.recent_signals ?? []).filter(
      signal => signal.source === 'Dossier de compte (15/10/2026)',
    )
    expect(fromDossier.length).toBeGreaterThanOrEqual(projects.length)
    expect(raw['recent_signals']).toEqual(account?.recent_signals)
  })

  it('« ESN présentes » lit les ESN du dossier, jamais au-dessus de « observée »', () => {
    const partners = briefPartners(brief!)
    expect(partners.length).toBeGreaterThan(20)
    expect(partners.every(partner => partner.certainty !== 'forte')).toBe(true)
  })

  it('l’organigramme est lu des fiches semées : aucun nœud sans contact, aucun lien donné pour vérifié', () => {
    const graph = orgGraphSchema.parse((raw['org'] as { orgGraph?: unknown } | undefined)?.orgGraph)
    const slugs = new Set((account?.contacts ?? []).map(contact => orgPersonSlug(contact.full_name)))
    expect(graph.people.length).toBeGreaterThan(5)
    expect(graph.people.filter(person => !slugs.has(person.id))).toEqual([])
    expect(graph.hierarchyEdges.filter(edge => edge.verified)).toEqual([])
    expect(graph.influenceEdges).toEqual([])
    expect(graph.coverage?.discovered).toBe(account?.contacts.length)
  })

  it('entités et sites viennent du brief ; chaque commune du dossier a son point (aucune perdue en silence)', () => {
    expect(raw['entities_exhaustive']).toHaveLength(brief!.entities.length)
    const sites = raw['sites_france'] as { city: string; latitude: number; longitude: number }[]
    expect(sites.map(site => site.city).sort()).toEqual([...new Set(brief!.sites.map(site => site.city))].sort())
    for (const site of sites) {
      expect(site.latitude).toBeGreaterThan(41)
      expect(site.latitude).toBeLessThan(51.5)
    }
    expect(account?.siren).toBeNull()
    expect(account?.headquarters.length).toBeGreaterThan(2)
  })

  it('les fiches : une par personne du brief, décideurs en tête, valeurs compatibles avec les CHECK SQL', () => {
    const contacts = account?.contacts ?? []
    expect(contacts.length).toBe(brief!.people.length)
    expect(contacts.length).toBeGreaterThan(50)
    const deciders = brief!.people.filter(person => person.role === 'decision_maker').length
    expect(contacts.slice(0, deciders).every(contact => contact.tags?.includes('Décideur'))).toBe(true)
    for (const contact of contacts) expect(normalizeTags(contact.tags ?? [])).toEqual(contact.tags)
    const names = contacts.map(contact => contact.full_name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    // un siège sans nom (nom = intitulé) ne se sème jamais
    expect(contacts.filter(contact => contact.full_name === contact.title)).toEqual([])
  })

  it('aucun nom de source interne, aucun fournisseur ne se lit à l’écran', () => {
    const everything = JSON.stringify({
      brief: raw['commercial_brief'],
      reading: account?.priority_justification,
      signals: account?.recent_signals,
      contacts: (account?.contacts ?? []).map(contact => [
        contact.profile_summary,
        contact.why_contact,
        contact.key_points,
      ]),
    })
    expect(everything).not.toMatch(/market\s*memory|\borion\b|dataforge|belloum|pappers|societe\.com/i)
  })

  it('compte ouvert à plusieurs contacts, avec une prochaine action : jamais « non étendu »', () => {
    expect(account?.commercial_status).toBe('watching')
    expect(account?.nextAction.title.length).toBeGreaterThan(10)
  })
})

describe('dossiers de compte du 15/10/2026 — classement et voisins', () => {
  it('aucune suggestion d’onboarding ne propose un compte déjà ouvert de la salle (Crédit Agricole → La Banque Postale)', () => {
    const suggested = (DEMO_PROFILE_CONTEXT.welcomeSummary?.firstAnalysisSuggestions ?? []).map(s => s.companyName)
    expect(suggested).toContain('La Banque Postale')
    for (const name of ACCOUNTS) expect(suggested).not.toContain(name)
  })

  it('classé SEEDÉ avec sa raison (craft rule 9) : les quatre comptes, ce qui reste vide à dessein', () => {
    expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.state).toBe('seede')
    for (const name of ['Crédit Agricole', 'VINCI', 'Enedis', 'Safran', 'convert:account-dossier', 'vides à dessein'])
      expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.reason.toLowerCase()).toContain(name.toLowerCase())
  })

  it('Safran : aucune coordonnée semée (le fichier n’en porte aucune) — jamais devinée', () => {
    const safran = DEMO_EXTENSION_ACCOUNTS.find(candidate => candidate.company_name === 'Safran')
    expect(safran?.contacts.filter(contact => contact.email || contact.phone)).toEqual([])
  })
})
