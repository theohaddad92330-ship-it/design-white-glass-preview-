import { buildComparisonQueries, pairRowsById, parseShadowCompareArgs } from './migration-shadow-compare-cli'

/**
 * #2446.7 (épopée #2772) — `migration-shadow-compare.ts` portait déjà les deux
 * fonctions pures de décision (`compareShadowRead`/`readyForCutover`, 7 tests)
 * mais aucun appelant : `git grep` ne trouvait ces noms que dans leur propre
 * spec. Ce fichier teste les fonctions pures du CLI qui les appelle enfin
 * contre deux tables réelles (même patron que `migration-backup.ts` /
 * `migration-restore.ts` : construction de requête pure, jamais de vraie
 * connexion ici).
 */
describe('parseShadowCompareArgs', () => {
  const base = ['--old-table', 'contacts_legacy', '--new-table', 'contacts', '--fields', 'email,full_name']

  it('lit table ancienne/nouvelle et la liste de champs', () => {
    expect(parseShadowCompareArgs(base)).toEqual({
      oldTable: 'contacts_legacy',
      newTable: 'contacts',
      idColumn: 'id',
      fields: ['email', 'full_name'],
      limit: 100,
      minSamples: 20,
    })
  })

  it('--id-column, --limit, --min-samples sont surchargeables', () => {
    const args = parseShadowCompareArgs([...base, '--id-column', 'contact_id', '--limit', '500', '--min-samples', '50'])
    expect(args).toMatchObject({ idColumn: 'contact_id', limit: 500, minSamples: 50 })
  })

  it('--old-table manquant refuse : jamais une table devinée', () => {
    expect(() => parseShadowCompareArgs(['--new-table', 'contacts', '--fields', 'email'])).toThrow(/--old-table/)
  })

  it('--new-table manquant refuse', () => {
    expect(() => parseShadowCompareArgs(['--old-table', 'contacts_legacy', '--fields', 'email'])).toThrow(/--new-table/)
  })

  it('--fields manquant refuse : comparer sans champ nommé ne veut rien dire', () => {
    expect(() => parseShadowCompareArgs(['--old-table', 'a', '--new-table', 'b'])).toThrow(/--fields/)
  })
})

describe('buildComparisonQueries', () => {
  it('sélectionne id + champs suivis, triés, bornés par --limit — jamais SELECT *', () => {
    const { oldQuery, newQuery } = buildComparisonQueries({
      oldTable: 'contacts_legacy',
      newTable: 'contacts',
      idColumn: 'id',
      fields: ['email', 'full_name'],
      limit: 100,
      minSamples: 20,
    })
    expect(oldQuery).toBe('SELECT id, email, full_name FROM contacts_legacy ORDER BY id LIMIT 100')
    expect(newQuery).toBe('SELECT id, email, full_name FROM contacts ORDER BY id LIMIT 100')
  })
})

describe('pairRowsById', () => {
  const fields = ['email'] as const

  it('apparie les lignes présentes des deux côtés par id', () => {
    const oldRows = [
      { id: 1, email: 'a@x.fr' },
      { id: 2, email: 'b@x.fr' },
    ]
    const newRows = [
      { id: 1, email: 'a@x.fr' },
      { id: 2, email: 'c@x.fr' },
    ]
    const pairs = pairRowsById(oldRows, newRows, 'id', fields)
    expect(pairs).toEqual([
      { oldValue: { id: 1, email: 'a@x.fr' }, newValue: { id: 1, email: 'a@x.fr' } },
      { oldValue: { id: 2, email: 'b@x.fr' }, newValue: { id: 2, email: 'c@x.fr' } },
    ])
  })

  it('une ligne absente d’un seul côté est appariée à null — jamais ignorée en silence', () => {
    const oldRows = [
      { id: 1, email: 'a@x.fr' },
      { id: 3, email: 'c@x.fr' },
    ]
    const newRows = [{ id: 1, email: 'a@x.fr' }]
    const pairs = pairRowsById(oldRows, newRows, 'id', fields)
    expect(pairs).toEqual([
      { oldValue: { id: 1, email: 'a@x.fr' }, newValue: { id: 1, email: 'a@x.fr' } },
      { oldValue: { id: 3, email: 'c@x.fr' }, newValue: null },
    ])
  })
})
