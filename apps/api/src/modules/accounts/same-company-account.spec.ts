import { pickSameCompanyAccount, sameCompanyPrefilterToken, type SameCompanyCandidate } from './same-company-account'

const at = (iso: string) => new Date(iso)
function candidate(overrides: Partial<SameCompanyCandidate>): SameCompanyCandidate {
  return {
    id: 'a1',
    company_name: 'Veepee',
    siren: null,
    status: 'imported',
    has_runs: false,
    updated_at: at('2026-10-20T10:00:00Z'),
    ...overrides,
  }
}

describe('#4603 — pickSameCompanyAccount : un compte = une société, quel que soit son chemin d’entrée', () => {
  it('reprend le compte venu du CRM (statut `imported`) sur le NOM normalisé — casse, accents, forme juridique', () => {
    const pick = pickSameCompanyAccount([candidate({ company_name: 'VEEPEE SAS' })], { companyName: 'Veepee' })
    expect(pick).toEqual({ account: expect.objectContaining({ id: 'a1' }), basis: 'name', key: 'veepee' })
  })

  it('reprend un compte QUEL QUE SOIT son statut — y compris l’`analyzing` de colonne d’une fiche CRM sans aucun run', () => {
    const pick = pickSameCompanyAccount([candidate({ status: 'analyzing', has_runs: false })], {
      companyName: 'Veepee',
    })
    expect(pick?.account.id).toBe('a1')
  })

  it('le SIREN d’abord : il gagne sur un nom qui ne ressemble pas', () => {
    const pick = pickSameCompanyAccount(
      [candidate({ id: 'crm', company_name: 'vente-privee.com', siren: '440297785' })],
      { companyName: 'Veepee', siren: '440 297 785' },
    )
    expect(pick).toEqual({ account: expect.objectContaining({ id: 'crm' }), basis: 'siren', key: '440297785' })
  })

  it('un SIREN qui CONTREDIT celui demandé n’est jamais repris sur le nom (ROCHE ≠ ROCHE BOBOIS, GA-96)', () => {
    const pick = pickSameCompanyAccount([candidate({ company_name: 'Roche', siren: '493229280' })], {
      companyName: 'Roche',
      siren: '552012031',
    })
    expect(pick).toBeNull()
  })

  it('deux comptes de même nom mais de SIREN différents : ambigu, on ne devine pas', () => {
    const pick = pickSameCompanyAccount(
      [candidate({ id: 'x', siren: '111111111' }), candidate({ id: 'y', siren: '222222222' })],
      { companyName: 'Veepee' },
    )
    expect(pick).toBeNull()
  })

  it('un nom fait de mots écartés ne rapproche que son égal exact, jamais tous les noms vides', () => {
    expect(pickSameCompanyAccount([candidate({ company_name: 'Holding' })], { companyName: 'Groupe' })).toBeNull()
  })

  it('un nom CONTENU dans l’autre n’est pas la même société (« Acme » ≠ « Acme Services »)', () => {
    expect(pickSameCompanyAccount([candidate({ company_name: 'Acme Services' })], { companyName: 'Acme' })).toBeNull()
  })

  it('n’attrape pas un run RÉELLEMENT en cours — la couche d’idempotence amont s’en charge', () => {
    const pick = pickSameCompanyAccount([candidate({ status: 'analyzing', has_runs: true })], { companyName: 'Veepee' })
    expect(pick).toBeNull()
  })

  it('un compte supprimé n’est jamais repris', () => {
    expect(pickSameCompanyAccount([candidate({ status: 'deleted' })], { companyName: 'Veepee' })).toBeNull()
  })

  it('plusieurs comptes de la même société : celui qui porte l’analyse, puis le plus récent', () => {
    const pick = pickSameCompanyAccount(
      [
        candidate({ id: 'crm-recent', updated_at: at('2026-10-25T10:00:00Z') }),
        candidate({ id: 'analysed', status: 'completed', has_runs: true, updated_at: at('2026-10-01T10:00:00Z') }),
      ],
      { companyName: 'Veepee' },
    )
    expect(pick?.account.id).toBe('analysed')
  })
})

describe('#4603 — sameCompanyPrefilterToken (rétrécit la lecture SQL, ne décide rien)', () => {
  it('rend le mot le plus long de la clé partagée', () => {
    expect(sameCompanyPrefilterToken('Société Générale SA')).toBe('generale')
  })
  it('rend null quand la clé est vide', () => {
    expect(sameCompanyPrefilterToken('  ')).toBeNull()
  })
})
