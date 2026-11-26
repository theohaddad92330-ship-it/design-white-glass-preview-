/**
 * Capacité « Marchés locaux » (L1) — la grille métier × séniorité, DÉTERMINISTE, calculée
 * sur les besoins et missions de l'espace seulement. Une cellule sous n=3 est ABSENTE.
 */
import { buildPriceGrid, familyOf } from './price-grid'
import type { ZoneGeo } from './zone-accounts'

const nord: ZoneGeo = { scope: 'france', departments: ['59'], cantons: [], cities: ['Lille'] }

const need = (over: Partial<Parameters<typeof buildPriceGrid>[0]['needs'][number]> = {}) => ({
  title: 'Développeur Java',
  seniority: 'confirme',
  target_tjm_cents: '45000',
  location: 'Lille',
  account_id: 'a1',
  ...over,
})
const run = (needs: ReturnType<typeof need>[], missions: Parameters<typeof buildPriceGrid>[0]['missions'] = []) =>
  buildPriceGrid({
    zone: nord,
    needs,
    missions,
    accountNames: new Map([
      ['a1', 'ADEO'],
      ['a2', 'Orange'],
    ]),
    period: 'au 04/10/2026',
  })

describe('familyOf', () => {
  it('range un intitulé de poste dans une famille', () => {
    expect(familyOf('Développeur Java Senior')).toBe('Développement')
    expect(familyOf('Data Engineer')).toBe('Data / BI')
    expect(familyOf('Ingénieur DevOps AWS')).toBe('Cloud / DevOps')
    expect(familyOf('Chef de projet MOA')).toBe('Gestion de projet / PMO')
  })
  it('rend null sur un intitulé qu’on ne sait pas classer — jamais une famille inventée', () => {
    expect(familyOf('Poste mystère')).toBeNull()
    expect(familyOf(null)).toBeNull()
  })
})

describe('buildPriceGrid', () => {
  it('convertit les centimes du TJM cible en euros (médiane)', () => {
    const grid = run([need(), need({ target_tjm_cents: '50000' }), need({ target_tjm_cents: '40000' })])
    expect(grid?.rows[0]).toMatchObject({ family: 'Développement', needs: 3, median: 450 })
    expect(grid?.currency).toBe('EUR')
    expect(grid?.source_kind).toBe('own_needs_missions')
  })

  it('porte n par cellule de séniorité', () => {
    const grid = run([
      need({ seniority: 'senior', target_tjm_cents: '60000' }),
      need({ seniority: 'senior', target_tjm_cents: '62000' }),
      need({ seniority: 'senior', target_tjm_cents: '58000' }),
      need({ seniority: 'junior', target_tjm_cents: '40000' }),
    ])
    expect(grid?.rows[0]?.senior).toEqual({ amount: 600, n: 3 })
  })

  it('une cellule à n<3 est ABSENTE, jamais un zéro ni un chiffre mince', () => {
    const grid = run([
      need({ seniority: 'senior' }),
      need({ seniority: 'senior' }),
      need({ seniority: 'senior' }),
      need({ seniority: 'junior', target_tjm_cents: '40000' }),
      need({ seniority: 'junior', target_tjm_cents: '41000' }),
    ])
    expect(grid?.rows[0]?.junior).toBeUndefined()
    expect(grid?.rows[0]?.senior?.n).toBe(3)
  })

  it('une famille sous n=3 n’a pas de ligne ; sans aucune ligne, pas de grille', () => {
    expect(run([need(), need()])).toBeNull()
  })

  it('exclut les besoins hors zone ou sans lieu', () => {
    const grid = run([need(), need(), need(), need({ location: 'Paris (75)' }), need({ location: null })])
    expect(grid?.rows[0]?.needs).toBe(3)
  })

  it('ignore un TJM absent ou nul — jamais compté comme 0', () => {
    const grid = run([need(), need(), need(), need({ target_tjm_cents: null }), need({ target_tjm_cents: '0' })])
    expect(grid?.rows[0]?.needs).toBe(3)
    expect(grid?.sample_size).toBe(3)
  })

  it('compte les missions (euros, sans séniorité) dans la médiane de la famille', () => {
    const grid = run(
      [need({ target_tjm_cents: '40000' }), need({ target_tjm_cents: '40000' })],
      [{ role_title: 'Développeur Java', daily_rate: 500, location: 'Lille', account_id: 'a2' }],
    )
    expect(grid?.rows[0]).toMatchObject({ needs: 3, median: 400, range: { min: 400, max: 500 } })
    expect(grid?.rows[0]?.confirmed).toBeUndefined()
  })

  it('nomme le client dominant', () => {
    const grid = run([need(), need(), need({ account_id: 'a2' })])
    expect(grid?.top_client).toEqual({ name: 'ADEO', n: 2 })
  })

  it('une zone suisse n’a pas de grille : aucune devise à convertir n’est inventée', () => {
    const grid = buildPriceGrid({
      zone: { scope: 'suisse', departments: [], cantons: ['VD'], cities: ['Lausanne'] },
      needs: [need({ location: 'Lausanne' }), need({ location: 'Lausanne' }), need({ location: 'Lausanne' })],
      missions: [],
      accountNames: new Map(),
      period: 'x',
    })
    expect(grid).toBeNull()
  })
})
