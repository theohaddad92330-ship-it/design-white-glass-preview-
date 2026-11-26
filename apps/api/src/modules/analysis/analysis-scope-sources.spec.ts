import { applyScopeToResearch, entityIsPublicSector } from './analysis-scope'

/**
 * #4142.6 — « secteur public » et « déjà travaillées » reliés à une SOURCE.
 *  · secteur public = catégorie juridique INSEE 7xxx, ou section NAF O (84.xx), lue sur le registre ;
 *  · déjà travaillée = compte avec au moins une affaire gagnée ou une relation client dans le CRM de l'espace.
 * Une entreprise sans donnée n'est NI incluse NI exclue (« non mesuré ») — jamais comptée 0.
 */
const research = {
  subsidiaries: [
    { name: 'Mairie de Lyon', siren: '211900000', nafCode: '84.11Z' },
    { name: 'Hôpital Nord', siren: '260000000', legalCategory: '7361' },
    { name: 'Acme Cloud', siren: '111111111', nafCode: '62.02A' },
    { name: 'Filiale sans donnée', siren: '222222222' },
    { name: 'Déjà cliente SAS', siren: '333333333', nafCode: '62.01Z' },
  ],
}
const names = (value: { subsidiaries?: unknown } | undefined) =>
  ((value?.subsidiaries ?? []) as { name: string }[]).map(item => item.name)

describe('entityIsPublicSector (#4142.6)', () => {
  it('catégorie juridique 7xxx → oui', () => expect(entityIsPublicSector({ legalCategory: '7361' })).toBe(true))
  it('NAF de la section O (84.xx) → oui', () => expect(entityIsPublicSector({ nafCode: '84.11Z' })).toBe(true))
  it('NAF privé, catégorie privée → non', () => {
    expect(entityIsPublicSector({ nafCode: '62.02A' })).toBe(false)
    expect(entityIsPublicSector({ legalCategory: '5710' })).toBe(false)
  })
  it('aucune donnée → null (non mesuré), jamais false', () => expect(entityIsPublicSector({ name: 'X' })).toBeNull())
})

describe('applyScopeToResearch — exclure le secteur public / les comptes déjà travaillés (#4142.6)', () => {
  it('exclude_public_sector retire les entités publiques, garde le privé ET le non mesuré', () => {
    const out = applyScopeToResearch(research, { exclude_public_sector: true })
    expect(names(out)).toEqual(['Acme Cloud', 'Filiale sans donnée', 'Déjà cliente SAS'])
  })

  it('exclude_worked_accounts retire les SIREN déjà travaillés, garde les entités sans SIREN connu', () => {
    const withoutSiren = { subsidiaries: [...research.subsidiaries, { name: 'Sans SIREN' }] }
    const out = applyScopeToResearch(
      withoutSiren,
      { exclude_worked_accounts: true },
      { workedSirens: new Set(['333333333']) },
    )
    expect(names(out)).not.toContain('Déjà cliente SAS')
    expect(names(out)).toContain('Sans SIREN')
    expect(names(out)).toContain('Filiale sans donnée')
  })

  it('exclude_worked_accounts SANS source fournie ne retire rien (non mesuré, jamais deviné)', () => {
    const out = applyScopeToResearch(research, { exclude_worked_accounts: true })
    expect(names(out)).toHaveLength(5)
  })

  it('sans ces deux réglages : même référence, dossier byte-identique', () => {
    expect(applyScopeToResearch(research, { excluded_entities: [] })).toBe(research)
  })
})

// #4294.4 — l'effectif minimum / maximum saisi sur /search MORD sur les entités du dossier (avant : le champ partait
// dans la requête et n'était lu par personne côté dossier — une option d'interface décorative).
describe('applyScopeToResearch — effectif minimum / maximum (#4294.4)', () => {
  const sized = {
    subsidiaries: [
      { name: 'Petite SAS', headcount: 12 },
      { name: 'Moyenne SAS', effectif: 120 },
      { name: 'Grande SA', employees: 5000 },
      { name: 'Tranche SAS', headcount_min: 50, headcount_max: 99 },
      { name: 'Sans effectif' },
    ],
  }

  it('headcount_min écarte les entités mesurées sous la borne, garde le non mesuré', () => {
    expect(names(applyScopeToResearch(sized, { headcount_min: 100 }))).toEqual([
      'Moyenne SAS',
      'Grande SA',
      'Sans effectif',
    ])
  })

  it('headcount_max écarte les entités mesurées au-dessus de la borne, garde le non mesuré', () => {
    expect(names(applyScopeToResearch(sized, { headcount_max: 100 }))).toEqual([
      'Petite SAS',
      'Tranche SAS',
      'Sans effectif',
    ])
  })

  it('une tranche est écartée seulement si elle ne recoupe PAS la fenêtre', () => {
    const out = names(applyScopeToResearch(sized, { headcount_min: 90, headcount_max: 200 }))
    expect(out).toContain('Tranche SAS')
    expect(out).toContain('Moyenne SAS')
    expect(out).not.toContain('Petite SAS')
    expect(out).not.toContain('Grande SA')
  })

  it('contrôle négatif : sans borne, même référence ; 0 n’est pas une absence de mesure', () => {
    expect(applyScopeToResearch(sized, { excluded_entities: [] })).toBe(sized)
    expect(
      names(applyScopeToResearch({ subsidiaries: [{ name: 'Zéro', headcount: 0 }] }, { headcount_min: 1 })),
    ).toEqual([])
  })
})
