import type { OrionNeedRecord } from './orion-needs-csv'
import {
  attachNeedAccountByName,
  buildAccountNameIndex,
  buildCommonNameIndex,
  resolveNeedAccount,
  type AccountNameFiche,
  type NeedAccountMatchTally,
} from './orion-needs-account-match'

const fiche = (sourceId: string, over: Partial<AccountNameFiche> = {}): AccountNameFiche => ({
  sourceId,
  name: null,
  normalizedName: null,
  legalName: null,
  statusNames: [],
  estDoublon: false,
  ...over,
})

describe('resolveNeedAccount', () => {
  const index = buildAccountNameIndex([
    fiche('DF-1', { name: 'MAIF' }),
    fiche('DF-2', { name: 'Société Générale', legalName: 'SOCIETE GENERALE SA' }),
    fiche('DF-3', { name: 'Doublon Corp' }),
    fiche('DF-4', { name: 'Doublon Corp' }),
    fiche('DF-5', { name: 'Accor', statusNames: ['Accor SA'] }),
    fiche('DF-6', { name: 'SNCF', estDoublon: true }),
  ])

  it('rattache un nom exact', () => {
    expect(resolveNeedAccount('MAIF', index)).toEqual({ kind: 'matched', sourceId: 'DF-1' })
  })

  it('ignore casse, accents et forme juridique', () => {
    expect(resolveNeedAccount('SOCIETE GENERALE', index)).toEqual({ kind: 'matched', sourceId: 'DF-2' })
    expect(resolveNeedAccount('société générale sa', index)).toEqual({ kind: 'matched', sourceId: 'DF-2' })
  })

  it('lit aussi les noms du statut ORION, une même fiche par plusieurs noms reste unique', () => {
    expect(resolveNeedAccount('Accor SA', index)).toEqual({ kind: 'matched', sourceId: 'DF-5' })
  })

  it('deux fiches au même nom => ambigu, pas de rattachement', () => {
    expect(resolveNeedAccount('Doublon Corp', index)).toEqual({ kind: 'ambiguous' })
  })

  it('un nom absent => introuvable', () => {
    expect(resolveNeedAccount('Inconnue SAS', index)).toEqual({ kind: 'not_found' })
    expect(resolveNeedAccount('   ', index)).toEqual({ kind: 'not_found' })
  })

  it('une fiche est_doublon ne peut pas être cible', () => {
    expect(resolveNeedAccount('SNCF', index)).toEqual({ kind: 'not_found' })
  })
})

describe('attachNeedAccountByName', () => {
  const index = buildAccountNameIndex([fiche('DF-1', { name: 'MAIF' }), fiche('DF-9', { name: 'Autre' })])
  const need = (over: Partial<OrionNeedRecord>): OrionNeedRecord => ({
    needId: 'n1',
    sourceFile: '24_MISSIONS_BESOINS',
    accountSourceId: null,
    entreprise: 'maif',
    title: 'Dev Java',
    description: null,
    domain: null,
    status: 'INCONNU',
    statusRaw: null,
    needDate: null,
    startDate: null,
    endDate: null,
    tjmEur: null,
    prescriberName: null,
    prescriberTitle: null,
    prescriberLastSeen: null,
    location: null,
    technologies: [],
    payload: {},
    ...over,
  })
  const tally = (): NeedAccountMatchTally => ({
    byId: 0,
    byName: 0,
    byCommonName: 0,
    commonOnly: 0,
    ambiguous: 0,
    notFound: 0,
    unmatchedNames: [],
  })

  it('rattache par nom et garde l’origine dans payload', () => {
    const t = tally()
    const out = attachNeedAccountByName(need({}), index, t)
    expect(out.accountSourceId).toBe('DF-1')
    expect(out.payload).toEqual({ account_match: 'nom' })
    expect(t.byName).toBe(1)
  })

  it('une ligne avec account_id n’est jamais réécrite par le nom', () => {
    const t = tally()
    const given = need({ accountSourceId: 'DF-9' })
    const out = attachNeedAccountByName(given, index, t)
    expect(out).toBe(given)
    expect(out.payload).toEqual({})
    expect(t.byId).toBe(1)
  })

  it('compte et nomme les non rattachés', () => {
    const t = tally()
    attachNeedAccountByName(need({ entreprise: 'Nulle Part' }), index, t)
    expect(t).toMatchObject({ notFound: 1, unmatchedNames: ['Nulle Part'] })
  })
})

describe('lot 794 — repli sur le référentiel pivot (common_account_links, clé de nom)', () => {
  const index = buildAccountNameIndex([
    fiche('DF-1', { name: 'MAIF' }),
    fiche('DF-3', { name: 'Doublon' }),
    fiche('DF-4', { name: 'Doublon' }),
  ])
  const link = (
    keyValue: string,
    commonId: string,
    dataforgeSourceId: string | null,
    groupAccountId: string | null = null,
  ) => ({
    keyValue,
    commonId,
    dataforgeSourceId,
    groupAccountId,
  })
  const common = buildCommonNameIndex([
    // Un alias du pack v2.1 (« Leroy Merlin France ») porté par UNE entreprise commune qui a sa fiche DF.
    link('leroy merlin', 'BM-A-000010', 'DF-0100'),
    link('leroy merlin', 'BM-A-000010', 'DF-0100'),
    // Une entreprise commune SANS fiche DF : rien à poser dans account_source_id.
    link('sisley', 'BM-A-000020', null),
    // Deux entreprises de groupes différents sous la même clé : ambigu.
    link('dior', 'BM-A-000030', 'DF-0300', 'BM-A-000030'),
    link('dior', 'BM-A-000031', 'DF-0301', 'BM-A-000031'),
    // Deux entreprises du MÊME groupe, une seule fiche DF : la fiche est univoque.
    link('moet hennessy', 'BM-A-000040', 'DF-0400', 'BM-A-000040'),
    link('moet hennessy', 'BM-A-000041', null, 'BM-A-000040'),
  ])
  const need = (entreprise: string, accountSourceId: string | null = null): OrionNeedRecord =>
    ({
      needId: 'n',
      sourceFile: '24_MISSIONS_BESOINS',
      accountSourceId,
      entreprise,
      payload: {},
    }) as unknown as OrionNeedRecord
  const tally = (): NeedAccountMatchTally => ({
    byId: 0,
    byName: 0,
    byCommonName: 0,
    commonOnly: 0,
    ambiguous: 0,
    notFound: 0,
    unmatchedNames: [],
  })

  it('le nom exact échoue, la clé normalisée du pivot trouve UNE fiche DF : account_source_id posé, origine gardée', () => {
    const t = tally()
    const out = attachNeedAccountByName(need('LEROY MERLIN SAS'), index, t, common)
    expect(out.accountSourceId).toBe('DF-0100')
    expect(out.payload).toEqual({ account_match: 'referentiel_commun', common_account_id: 'BM-A-000010' })
    expect(t).toMatchObject({ byCommonName: 1, notFound: 0, unmatchedNames: [] })
  })

  it('même groupe, une seule fiche DF : rattaché', () => {
    const out = attachNeedAccountByName(need('Moët Hennessy'), index, tally(), common)
    expect(out.accountSourceId).toBe('DF-0400')
  })

  it('entreprise commune sans fiche DF : account_source_id reste vide, l’identifiant commun est gardé, compté à part', () => {
    const t = tally()
    const out = attachNeedAccountByName(need('Sisley'), index, t, common)
    expect(out.accountSourceId).toBeNull()
    expect(out.payload).toEqual({ account_match: 'referentiel_commun_sans_fiche', common_account_id: 'BM-A-000020' })
    expect(t).toMatchObject({ commonOnly: 1, notFound: 0, unmatchedNames: [] })
  })

  it('clé du pivot ambiguë (groupes différents) : rien posé, compté ambigu et nommé', () => {
    const t = tally()
    const out = attachNeedAccountByName(need('Dior'), index, t, common)
    expect(out.accountSourceId).toBeNull()
    expect(t).toMatchObject({ ambiguous: 1, unmatchedNames: ['Dior'] })
  })

  it('le nom exact unique DF gagne toujours ; un account_id fourni n’est jamais réécrit', () => {
    expect(attachNeedAccountByName(need('maif'), index, tally(), common).payload).toEqual({ account_match: 'nom' })
    expect(attachNeedAccountByName(need('Leroy Merlin', 'DF-9'), index, tally(), common).accountSourceId).toBe('DF-9')
  })

  it('un nom DF ambigu se rattrape par le pivot seulement si sa clé y est univoque', () => {
    const t = tally()
    expect(attachNeedAccountByName(need('Doublon'), index, t, common).accountSourceId).toBeNull()
    expect(t.ambiguous).toBe(1)
  })
})
