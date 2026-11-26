import { enrichmentCooldown } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'
import { demoCoordinateAvailability, demoEnrichmentCoordinates, demoEnrichmentTrace } from './demo-enrichment-trace'

/**
 * #3549.4 (recette salle démo 03/10) — un contact « Enrichi » (e-mail OU
 * téléphone présent) avec l'autre canal vide doit porter une trace d'essai, sinon
 * /contacts affiche « - » (jamais-enrichi) au lieu de « Téléphone non trouvé » /
 * « E-mail non trouvé ». La garde sait dire NON : elle lit tout le jeu de démo.
 */
const NOW = new Date('2026-10-03T10:00:00Z')

describe('trace d’enrichissement démo (#3549.4)', () => {
  it('e-mail seul : un essai abouti (matched), téléphone nommé manquant, aucun délai de protection', () => {
    const trace = demoEnrichmentTrace({ email: 'a@b.fr' }, NOW)
    expect(trace?.last_enrichment_result).toBe('matched')
    expect(trace?.last_enrichment_missing).toEqual(expect.arrayContaining(['phone']))
    expect(trace?.last_enrichment_missing).not.toContain('email')
    expect(trace && enrichmentCooldown(trace, NOW)).toBeNull()
  })

  it('téléphone seul : e-mail nommé manquant', () => {
    const trace = demoEnrichmentTrace({ phone: '+33 6 12 34 56 78' }, NOW)
    expect(trace?.last_enrichment_missing).toContain('email')
  })

  it('complet, ou sans e-mail ni téléphone : AUCUN essai raconté (le tiret reste vrai)', () => {
    expect(demoEnrichmentTrace({ email: 'a@b.fr', phone: '+33 6 12 34 56 78' }, NOW)).toBeNull()
    expect(demoEnrichmentTrace({ linkedin_url: 'https://linkedin.com/in/x' }, NOW)).toBeNull()
    expect(demoEnrichmentTrace({}, NOW)).toBeNull()
  })

  it('l’essai récent resté vide (#2297.26) est inchangé : no_new_data, sous délai', () => {
    const trace = demoEnrichmentTrace({ recently_enriched_no_result_days_ago: 3 }, NOW)
    expect(trace?.last_enrichment_result).toBe('no_new_data')
    expect(trace && enrichmentCooldown(trace, NOW)).not.toBeNull()
  })

  it('sur TOUT le jeu de démo : aucun contact joignable par un seul de e-mail/téléphone sans trace', () => {
    const all = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts)
    expect(all.length).toBeGreaterThan(0)
    const half = all.filter(c => Boolean(c.email) !== Boolean(c.phone))
    expect(half.length).toBeGreaterThan(0)
    const without = half.filter(c => demoEnrichmentTrace(c, NOW) === null)
    expect(without.map(c => c.full_name)).toEqual([])
  })
})

// E1 (#3698, #3822) — l’état par coordonnée de la salle, dérivé de la MÊME trace.
describe('demoEnrichmentCoordinates (E1)', () => {
  const at = new Date('2026-10-07T10:00:00Z')

  it('canal manquant après un essai : « introuvable chez 2 sources » ; présent : « trouvé »', () => {
    const states = demoEnrichmentCoordinates({ email: 'a@demo.example', phone: null, linkedin_url: null }, at)
    expect(states?.email?.state).toBe('found')
    expect(states?.phone).toMatchObject({ state: 'not_found', sources_queried: 2 })
    expect(states?.linkedin?.state).toBe('not_found')
  })

  it('NON : sans essai à raconter (complet ou jamais cherché), aucun état inventé', () => {
    expect(demoEnrichmentCoordinates({ email: null, phone: null }, at)).toBeNull()
    expect(demoEnrichmentCoordinates({ email: 'a@demo.example', phone: '+33 6 00 00 00 00' }, at)).toBeNull()
  })

  it('la salle en porte réellement : au moins un contact du jeu a un canal « introuvable »', () => {
    const contacts = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts ?? [])
    const withNotFound = contacts.filter(contact =>
      Object.values(demoEnrichmentCoordinates(contact, at) ?? {}).some(state => state?.state === 'not_found'),
    )
    expect(withNotFound.length).toBeGreaterThan(0)
  })
})

describe('R22 a4 — disponibilité des coordonnées en démo (4 états)', () => {
  const now = new Date('2026-10-22T10:00:00Z')

  it('une coordonnée présente ne porte aucune annonce', () => {
    expect(
      demoCoordinateAvailability({ full_name: 'Amina Benali', email: 'a@b.example', phone: '+33 1' }, now),
    ).toEqual({
      email_availability: null,
      phone_availability: null,
    })
  })

  it('un canal manquant après essai est « introuvable » (la date vient de la trace)', () => {
    expect(demoCoordinateAvailability({ full_name: 'Amina Benali', email: 'a@b.example', phone: null }, now)).toEqual({
      email_availability: null,
      phone_availability: 'not_found',
    })
  })

  it('un siège sans coordonnée ni essai : annoncé disponible pour une partie, jamais cherché pour le reste', () => {
    const names = ['Jean Dupont', 'Anne Martin', 'Xavier Blanc', 'Yann Leroy', 'Sophie Marceau', 'Léa Fabre']
    const rows = names.map(full_name => demoCoordinateAvailability({ full_name, email: null, phone: null }, now))
    expect(rows.some(row => row.email_availability === 'available')).toBe(true)
    expect(rows.some(row => row.email_availability === null)).toBe(true)
    expect(rows.every(row => row.email_availability !== 'not_found')).toBe(true)
  })

  it('stable : le même nom donne toujours la même réponse', () => {
    const input = { full_name: 'Jean Dupont', email: null, phone: null }
    expect(demoCoordinateAvailability(input, now)).toEqual(demoCoordinateAvailability(input, now))
  })
})
