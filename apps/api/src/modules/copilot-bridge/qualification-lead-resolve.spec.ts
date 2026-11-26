import type { ProjectReadRow } from '@bellum/contracts'
import { resolveQualificationLeads } from './qualification-lead-resolve'

const row = (id: string, label: string, company: string, stage = 'detected', account = 'acc-' + company) =>
  ({ id, label, company_name: company, stage, account_id: account }) as unknown as ProjectReadRow

const ROWS = [
  row('p1', 'Risque de ralentissement du time-to-market sur la plateforme', 'ACTIA Group'),
  row('p2', 'Refonte du SI logistique', 'ACTIA Group'),
  row('p3', 'Migration cloud', 'Orano'),
  row('p4', 'Migration cloud en cours', 'Orano', 'won'),
]

describe('#3345 — une piste se retrouve par son libellé, jamais par un identifiant demandé à l’humain', () => {
  it('une correspondance de libellé unique rend la piste et son identifiant', () => {
    const res = resolveQualificationLeads(ROWS, { label: 'Risque de ralentissement du time-to-market' })
    expect(res.matched_on).toBe('label')
    expect(res.matches.map(m => m.lead_key)).toEqual(['p1'])
  })

  it('l’accent et la casse ne comptent pas', () => {
    expect(resolveQualificationLeads(ROWS, { label: 'refonte du si LOGISTIQUE' }).matches.map(m => m.lead_key)).toEqual(
      ['p2'],
    )
  })

  it('« piste ACTIA Group » : le compte cadre, deux pistes → une liste à choisir', () => {
    const res = resolveQualificationLeads(ROWS, { label: 'piste ACTIA Group' })
    expect(res.matched_on).toBe('account')
    expect(res.matches.map(m => m.lead_key).sort()).toEqual(['p1', 'p2'])
  })

  it('un libellé qui correspond gagne sur le compte seul', () => {
    const res = resolveQualificationLeads(ROWS, { label: 'ACTIA Group Refonte du SI logistique' })
    expect(res.matched_on).toBe('label')
    expect(res.matches.map(m => m.lead_key)).toEqual(['p2'])
  })

  it('sait dire NON : rien ne correspond → aucune piste, jamais une piste devinée', () => {
    expect(resolveQualificationLeads(ROWS, { label: 'piste Inexistante SA' })).toEqual({
      matched_on: 'none',
      matches: [],
    })
    expect(resolveQualificationLeads(ROWS, { label: '   ' })).toEqual({ matched_on: 'none', matches: [] })
    expect(resolveQualificationLeads(ROWS, { label: 'piste' })).toEqual({ matched_on: 'none', matches: [] })
  })

  it('une opportunité déjà au pipe n’est pas une piste à qualifier', () => {
    const res = resolveQualificationLeads(ROWS, { label: 'Migration cloud en cours' })
    expect(res.matches.map(m => m.lead_key)).not.toContain('p4')
  })

  it('un compte donné borne la recherche', () => {
    const res = resolveQualificationLeads(ROWS, { label: 'Migration cloud', accountId: 'acc-ACTIA Group' })
    expect(res.matches).toEqual([])
  })
})
