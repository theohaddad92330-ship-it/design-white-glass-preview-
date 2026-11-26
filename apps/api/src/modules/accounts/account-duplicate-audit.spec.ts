import { auditDuplicateAccounts, type DuplicateAuditAccount } from './account-duplicate-audit'

const acc = (over: Partial<DuplicateAuditAccount> & { id: string }): DuplicateAuditAccount => ({
  companyName: 'Veolia',
  siren: null,
  status: 'completed',
  mergedIntoId: null,
  hasData: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

describe('auditDuplicateAccounts (#4294.9 — audit des doublons, simulation)', () => {
  it('groupe deux comptes de même SIREN, même écrits différemment', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'a', companyName: 'Veolia', siren: '403 210 032' }),
      acc({ id: 'b', companyName: 'Veolia Environnement SA', siren: '403210032' }),
    ])
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0]).toMatchObject({ basis: 'siren', accountIds: ['a', 'b'] })
  })

  it('groupe par nom normalisé quand le SIREN manque (casse, accents, ponctuation)', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'a', companyName: 'Société Générale' }),
      acc({ id: 'b', companyName: 'societe generale.' }),
    ])
    expect(out.groups[0]).toMatchObject({ basis: 'name', accountIds: ['a', 'b'] })
  })

  it('NE COMPTE PAS les coquilles vides en erreur : elles sont masquées par la liste, donc comptées à part', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'real', companyName: 'Thales' }),
      acc({ id: 'shell1', companyName: 'Thales', status: 'error', hasData: false }),
      acc({ id: 'shell2', companyName: 'THALES', status: 'canceled', hasData: false }),
    ])
    expect(out.groups).toEqual([])
    expect(out.emptyShells).toBe(2)
    expect(out.examined).toBe(1)
  })

  it('un compte en erreur QUI PORTE des données reste un candidat (même règle que la liste)', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'a', companyName: 'Thales' }),
      acc({ id: 'b', companyName: 'Thales', status: 'error', hasData: true }),
    ])
    expect(out.groups).toHaveLength(1)
    expect(out.emptyShells).toBe(0)
  })

  it('ignore les dossiers déjà rattachés ou rangés — ce ne sont plus des doublons', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'a', companyName: 'KLESIA' }),
      acc({ id: 'b', companyName: 'KLESIA', mergedIntoId: 'a' }),
      acc({ id: 'c', companyName: 'KLESIA', status: 'archived' }),
    ])
    expect(out.groups).toEqual([])
  })

  it('propose de garder le compte le mieux renseigné, puis le plus ancien — sans rien écrire', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'young', companyName: 'Engie', createdAt: '2026-05-01T00:00:00Z' }),
      acc({ id: 'old', companyName: 'Engie', createdAt: '2026-02-01T00:00:00Z' }),
      acc({ id: 'rich', companyName: 'Engie', createdAt: '2026-06-01T00:00:00Z', hasData: true, status: 'completed' }),
      acc({ id: 'poor', companyName: 'Engie', hasData: false, status: 'completed' }),
    ])
    expect(out.groups[0]?.suggestedKeepId).toBe('old')
    expect(out.groups[0]?.accountIds).toHaveLength(4)
    expect(out.wouldAbsorb).toBe(3)
  })

  it('un nom vide ne forme jamais de groupe', () => {
    const out = auditDuplicateAccounts([acc({ id: 'a', companyName: ' ' }), acc({ id: 'b', companyName: '' })])
    expect(out.groups).toEqual([])
  })

  it('un SIREN et un nom différents ne se mélangent pas : un compte n’est que dans UN groupe', () => {
    const out = auditDuplicateAccounts([
      acc({ id: 'a', companyName: 'Alpha', siren: '111111111' }),
      acc({ id: 'b', companyName: 'Alpha Group', siren: '111111111' }),
      acc({ id: 'c', companyName: 'Alpha' }),
    ])
    const ids = out.groups.flatMap(g => g.accountIds)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
