import { readReferenceDossier, REFERENCE_DOSSIER_KEY } from '@bellum/contracts'
import { BPCE_ROWS } from './bpce-seed'
import { buildReferenceDossier } from './bpce-reference-dossier'

/** Théo A comptes-fiche-reference — le dossier de référence BPCE, lu dans le relevé réel. */
describe('buildReferenceDossier (relevé BPCE)', () => {
  const dossier = buildReferenceDossier(BPCE_ROWS, { statementDate: '01/10/2026' })

  it('passe le vrai contrat', () => {
    expect(readReferenceDossier({ [REFERENCE_DOSSIER_KEY]: dossier })).toEqual(dossier)
  })

  it('compte ce que le relevé compte : 55 unités, 18 besoins, 16 relevés de TJM, 49 contacts', () => {
    expect(dossier.counts).toEqual({ units: 55, historical_needs: 18, tjm_observations: 16, contacts: 49 })
  })

  it('range les 55 unités par regroupement de lecture : 10 · 6 · 10 · 29', () => {
    expect(dossier.organisation.map(group => [group.label, group.units.length])).toEqual([
      ['Domaines & fonctions', 10],
      ['Groupements & coentreprises', 6],
      ['Entités & filiales', 10],
      ['Réseaux coopératifs', 29],
    ])
  })

  it('les TJM restent par circuit, sans moyenne entre direct et intermédiaire', () => {
    expect(dossier.tjm).toEqual([
      { channel: 'msp', observations: 9, min: 390, max: 700 },
      { channel: 'direct', observations: 7, min: 470, max: 941 },
    ])
  })

  it('ne chiffre une expertise que sur les lignes du relevé, la plus fournie d’abord', () => {
    expect(dossier.expertises[0]).toEqual({ label: 'Infrastructure, production et sécurité', count: 8 })
    expect(dossier.expertises.reduce((total, entry) => total + entry.count, 0)).toBe(18)
    expect(dossier.expertises.map(entry => entry.label)).toContain('Domaine non renseigné')
  })

  it('l’historique des besoins garde les 18 lignes, la plus récente d’abord, sans prix inventé', () => {
    expect(dossier.needs).toHaveLength(18)
    expect(dossier.needs[0]).toMatchObject({ period: '2026-01' })
    expect(dossier.needs.filter(need => need.rate === null)).toHaveLength(2)
  })

  it('neuf programmes cités, datés seulement quand le relevé les date', () => {
    expect(dossier.programmes).toHaveLength(9)
    expect(dossier.programmes.every(programme => programme.statement_label === 'Relevé du 01/10/2026')).toBe(true)
    const undated = dossier.programmes.filter(programme => programme.period === null)
    expect(undated.map(programme => programme.title)).toEqual(
      expect.arrayContaining(['Orion — plateforme commune de banque de détail']),
    )
  })

  it('les pratiques achats reprennent la chaîne et le détail de référencement, avec leur fiabilité', () => {
    expect(dossier.purchasing).toHaveLength(10)
    expect(dossier.purchasing.some(step => step.reliability === 'Garde-fou')).toBe(true)
  })

  it('l’écosystème sépare l’observé du signal indirect', () => {
    const natures = new Set(dossier.ecosystem.map(actor => actor.nature))
    expect(natures).toEqual(new Set(['observed', 'indirect']))
    expect(dossier.ecosystem.filter(actor => actor.nature === 'indirect')).toHaveLength(1)
  })
})
